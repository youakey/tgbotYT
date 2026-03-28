import dotenv from "dotenv";
import path from "node:path";

dotenv.config();

function requireString(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseIntWithDefault(name: string, fallback: number): number {
  const value = process.env[name]?.trim();
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid numeric environment variable: ${name}`);
  }

  return parsed;
}

function parseBooleanWithDefault(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) {
    return fallback;
  }

  if (value === "true" || value === "1" || value === "yes") {
    return true;
  }

  if (value === "false" || value === "0" || value === "no") {
    return false;
  }

  throw new Error(`Invalid boolean environment variable: ${name}`);
}

export const config = {
  botToken: requireString("BOT_TOKEN"),
  enablePolling: parseBooleanWithDefault("ENABLE_POLLING", true),
  port: parseIntWithDefault("PORT", 3000),
  backendApiKey: process.env.BACKEND_API_KEY?.trim() || "",
  maxFileSizeMb: parseIntWithDefault("MAX_FILE_SIZE_MB", 50),
  tempDir: path.resolve(process.cwd(), process.env.TEMP_DIR?.trim() || "./tmp"),
  maxConcurrent: parseIntWithDefault("MAX_CONCURRENT", 2),
  downloadTimeoutMs: parseIntWithDefault("DOWNLOAD_TIMEOUT_MS", 60000),
  maxRedirects: parseIntWithDefault("MAX_REDIRECTS", 5),
  networkRetryCount: parseIntWithDefault("NETWORK_RETRY_COUNT", 1),
  redisUrl: process.env.REDIS_URL?.trim() || "",
  ytDlpPath: process.env.YT_DLP_PATH?.trim() || "yt-dlp",
  tiktokCookiesFromBrowser: process.env.TIKTOK_COOKIES_FROM_BROWSER?.trim() || "",
  ffmpegPath: process.env.FFMPEG_PATH?.trim() || "ffmpeg",
  overlayPath: path.resolve(process.cwd(), process.env.OVERLAY_PATH?.trim() || "assets/shorts-overlay.png"),
  processTimeoutMs: parseIntWithDefault("PROCESS_TIMEOUT_MS", 60000)
} as const;

export const limits = {
  maxFileSizeBytes: config.maxFileSizeMb * 1024 * 1024
} as const;
