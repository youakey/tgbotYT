import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { config, limits } from "../config";
import { DependencyMissingError, FileTooLargeError, TimeoutError, UnsupportedSourceError } from "../utils/errors";
import { cleanupFilesByPrefix, createTempOutputTemplate } from "./tempFileService";

export type TikTokDownloadResult = {
  filePath: string;
  fileName: string;
  sizeBytes: number;
};

class YtDlpExecutionError extends Error {
  public readonly stderr: string;

  constructor(message: string, stderr: string) {
    super(message);
    this.name = "YtDlpExecutionError";
    this.stderr = stderr;
  }
}

function sanitizeFileName(fileName: string): string {
  const normalized = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
  return normalized || "video.mp4";
}

function isFileTooLargeError(stderr: string): boolean {
  return stderr.toLowerCase().includes("larger than max-filesize");
}

function isCookieAccessError(stderr: string): boolean {
  const lower = stderr.toLowerCase();
  return (
    lower.includes("cookies") &&
    (lower.includes("operation not permitted") ||
      lower.includes("permission denied") ||
      lower.includes("could not find browser") ||
      lower.includes("failed to decrypt"))
  );
}

async function runYtDlp(url: string, outputTemplate: string, useCookies: boolean): Promise<string> {
  const binaryCandidates = [
    config.ytDlpPath,
    "./bin/yt-dlp",
    "/opt/render/project/src/bin/yt-dlp",
    "/opt/render/.local/bin/yt-dlp",
    "yt-dlp"
  ];

  const args = [
    "--no-playlist",
    "--no-warnings",
    "--restrict-filenames",
    "--no-progress",
    "--retries",
    "2",
    "--socket-timeout",
    "20",
    "-f",
    "bv*+ba/b",
    "-S",
    "size,br,res,fps",
    "--print",
    "after_move:filepath",
    "-o",
    outputTemplate,
    url
  ];

  if (useCookies && config.tiktokCookiesFromBrowser) {
    args.unshift(config.tiktokCookiesFromBrowser);
    args.unshift("--cookies-from-browser");
  }

  let lastError: unknown;

  for (const binaryPath of binaryCandidates) {
    if (!binaryPath) {
      continue;
    }

    try {
      return await new Promise<string>((resolve, reject) => {
        const child = spawn(binaryPath, args, {
          stdio: ["ignore", "pipe", "pipe"]
        });

        let stdout = "";
        let stderr = "";
        let timedOut = false;

        const timer = setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, config.downloadTimeoutMs);

        child.stdout.on("data", (chunk: Buffer) => {
          stdout += chunk.toString("utf8");
        });

        child.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString("utf8");
        });

        child.once("error", (error: NodeJS.ErrnoException) => {
          clearTimeout(timer);
          reject(error);
        });

        child.once("close", (code) => {
          clearTimeout(timer);

          if (timedOut) {
            reject(new TimeoutError("Request timed out"));
            return;
          }

          if (code !== 0) {
            if (isFileTooLargeError(stderr)) {
              reject(new FileTooLargeError("File is too large for Telegram"));
              return;
            }

            reject(new YtDlpExecutionError("yt-dlp execution failed", stderr));
            return;
          }

          const lines = stdout
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

          const filePath = lines.at(-1);
          if (!filePath) {
            reject(new UnsupportedSourceError("Source is not supported"));
            return;
          }

          resolve(filePath);
        });
      });
    } catch (error) {
      lastError = error;
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }

  if ((lastError as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
    throw new DependencyMissingError("yt-dlp is not installed");
  }

  throw new UnsupportedSourceError("Source is not supported");
}

export async function downloadTikTokVideo(url: URL, prefix: string): Promise<TikTokDownloadResult> {
  const outputTemplate = createTempOutputTemplate(prefix);

  try {
    let filePath: string;

    try {
      filePath = await runYtDlp(url.toString(), outputTemplate, true);
    } catch (error) {
      if (error instanceof YtDlpExecutionError && config.tiktokCookiesFromBrowser && isCookieAccessError(error.stderr)) {
        filePath = await runYtDlp(url.toString(), outputTemplate, false);
      } else {
        throw error;
      }
    }

    const fileStats = await stat(filePath);

    if (fileStats.size > limits.maxFileSizeBytes) {
      throw new FileTooLargeError("File is too large for Telegram");
    }

    const fileName = sanitizeFileName(path.basename(filePath));

    return {
      filePath,
      fileName,
      sizeBytes: fileStats.size
    };
  } catch (error) {
    await cleanupFilesByPrefix(prefix);

    if (error instanceof YtDlpExecutionError) {
      throw new UnsupportedSourceError("Source is not supported");
    }

    throw error;
  }
}
