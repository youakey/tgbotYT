import axios from "axios";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { config, limits } from "../config";
import { FileTooLargeError, NetworkError, TimeoutError, UnsupportedSourceError } from "../utils/errors";
import { createTempFilePathForPrefix, safeDeleteFile } from "./tempFileService";
import { downloadTikTokVideo } from "./tiktokDownloadService";
import { resolveSafeUrl } from "./urlValidationService";

export type DownloadResult = {
  filePath: string;
  fileName: string;
  sizeBytes: number;
};

function pickExtension(url: URL, contentType?: string): string {
  const fromPath = path.extname(url.pathname);
  if (fromPath && fromPath.length <= 8) {
    return fromPath.toLowerCase();
  }

  if (contentType?.includes("mp4")) return ".mp4";
  if (contentType?.includes("webm")) return ".webm";
  if (contentType?.includes("quicktime")) return ".mov";
  if (contentType?.includes("x-matroska")) return ".mkv";
  return ".bin";
}

function hasVideoLikePath(url: URL): boolean {
  const ext = path.extname(url.pathname).toLowerCase();
  return [".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".wmv", ".flv", ".ts", ".mpg", ".mpeg"].includes(ext);
}

function isSupportedContentType(contentType: string, url: URL): boolean {
  if (!contentType) {
    return hasVideoLikePath(url);
  }

  if (contentType.startsWith("video/")) {
    return true;
  }

  const allowedApplicationTypes = [
    "application/octet-stream",
    "application/mp4",
    "application/x-mp4",
    "application/vnd.apple.mpegurl",
    "application/x-mpegurl"
  ];

  if (allowedApplicationTypes.some((value) => contentType.startsWith(value))) {
    return true;
  }

  if (contentType.startsWith("text/html") || contentType.startsWith("application/json")) {
    return false;
  }

  // Some hosts return generic content types for downloadable objects.
  return hasVideoLikePath(url);
}

function isRetryableNetworkError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) {
    return false;
  }

  const code = error.code || "";
  if (code === "ECONNABORTED") {
    return false;
  }

  return ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "EPIPE", "ECONNREFUSED", "EHOSTUNREACH"].includes(code);
}

function sanitizeFileName(fileName: string): string {
  const normalized = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
  return normalized || "video.bin";
}

export async function downloadVideoFile(inputUrl: string, prefix: string): Promise<DownloadResult> {
  const safeUrl = await resolveSafeUrl(inputUrl);

  if (safeUrl.hostname.endsWith("tiktok.com")) {
    return await downloadTikTokVideo(safeUrl, prefix);
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= config.networkRetryCount; attempt += 1) {
    let tempFilePath: string | null = null;

    try {
      const controller = new AbortController();
      const response = await axios.get(safeUrl.toString(), {
        responseType: "stream",
        timeout: config.downloadTimeoutMs,
        signal: controller.signal,
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 300
      });

      const contentType = String(response.headers["content-type"] || "").toLowerCase();
      if (!isSupportedContentType(contentType, safeUrl)) {
        throw new UnsupportedSourceError("Source is not supported");
      }

      const contentLengthRaw = response.headers["content-length"];
      if (contentLengthRaw) {
        const contentLength = Number.parseInt(String(contentLengthRaw), 10);
        if (Number.isFinite(contentLength) && contentLength > limits.maxFileSizeBytes) {
          throw new FileTooLargeError("File is too large for Telegram");
        }
      }

      const ext = pickExtension(safeUrl, contentType);
      tempFilePath = createTempFilePathForPrefix(prefix, ext);
      const output = createWriteStream(tempFilePath, { mode: 0o600 });

      let sizeBytes = 0;
      response.data.on("data", (chunk: Buffer) => {
        sizeBytes += chunk.length;
        if (sizeBytes > limits.maxFileSizeBytes) {
          controller.abort();
        }
      });

      await pipeline(response.data, output);

      if (sizeBytes > limits.maxFileSizeBytes) {
        throw new FileTooLargeError("File is too large for Telegram");
      }

      return {
        filePath: tempFilePath,
        fileName: sanitizeFileName(path.basename(new URL(safeUrl).pathname) || `video${ext}`),
        sizeBytes
      };
    } catch (error) {
      await safeDeleteFile(tempFilePath);

      if (error instanceof FileTooLargeError || error instanceof UnsupportedSourceError) {
        throw error;
      }

      if (axios.isAxiosError(error) && error.code === "ECONNABORTED") {
        throw new TimeoutError("Request timed out");
      }

      if (isRetryableNetworkError(error) && attempt < config.networkRetryCount) {
        lastError = error;
        continue;
      }

      if (isRetryableNetworkError(error)) {
        throw new NetworkError("Network error");
      }

      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new NetworkError("Network error");
}
