import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { config } from "../config";
import {
  OverlayMissingError,
  ProcessingFailedError,
  ProcessingTimeoutError,
  ProcessingUnavailableError
} from "../utils/errors";
import { createTempFilePathForPrefix } from "./tempFileService";

type ProcessingOptions = {
  mirrorVideo?: boolean;
  overlayPath?: string;
};

function buildFilterGraph(mirrorVideo: boolean): string {
  const mirrorFilter = mirrorVideo ? "hflip," : "";
  return `[1:v]scale=1080:1920[bg];[0:v]${mirrorFilter}scale=1080:1180:force_original_aspect_ratio=increase,crop=1080:1180[v];[bg][v]overlay=0:370[outv]`;
}

function isCorruptedInput(stderr: string): boolean {
  const lower = stderr.toLowerCase();
  return (
    lower.includes("invalid data found") ||
    lower.includes("moov atom not found") ||
    lower.includes("could not find codec parameters")
  );
}

export async function processVideo(
  inputPath: string,
  prefix: string,
  options: ProcessingOptions = {}
): Promise<{ outputPath: string; fileName: string }> {
  const mirrorVideo = options.mirrorVideo ?? true;
  const overlayPath = options.overlayPath || config.overlayPath;

  try {
    await access(overlayPath);
  } catch {
    throw new OverlayMissingError(`Overlay file is missing: ${overlayPath}`);
  }

  const outputPath = createTempFilePathForPrefix(`${prefix}-processed`, ".mp4");
  const filterGraph = buildFilterGraph(mirrorVideo);

  const args = [
    "-y",
    "-i",
    inputPath,
    "-i",
    overlayPath,
    "-filter_complex",
    filterGraph,
    "-map",
    "[outv]",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-crf",
    "20",
    "-preset",
    "fast",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    outputPath
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(config.ffmpegPath, args, {
      stdio: ["ignore", "ignore", "pipe"]
    });

    let stderr = "";
    let didTimeout = false;

    const timer = setTimeout(() => {
      didTimeout = true;
      child.kill("SIGKILL");
    }, config.processTimeoutMs);

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.once("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (error.code === "ENOENT") {
        reject(new ProcessingUnavailableError("Processing unavailable: ffmpeg is not installed"));
        return;
      }
      reject(new ProcessingFailedError("Processing failed"));
    });

    child.once("close", (code) => {
      clearTimeout(timer);

      if (didTimeout) {
        reject(new ProcessingTimeoutError("Processing timed out"));
        return;
      }

      if (code !== 0) {
        if (isCorruptedInput(stderr)) {
          reject(new ProcessingFailedError("Processing failed: corrupted input"));
          return;
        }

        reject(new ProcessingFailedError("Processing failed"));
        return;
      }

      resolve();
    });
  });

  return {
    outputPath,
    fileName: `${prefix}-processed.mp4`
  };
}
