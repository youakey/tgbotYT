export class BotError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "BotError";
    this.code = code;
  }
}

export class InvalidUrlError extends BotError {
  constructor(message = "Invalid URL") {
    super("INVALID_URL", message);
  }
}

export class UnsupportedSourceError extends BotError {
  constructor(message = "Source is not supported") {
    super("UNSUPPORTED_SOURCE", message);
  }
}

export class TimeoutError extends BotError {
  constructor(message = "Download timed out") {
    super("TIMEOUT", message);
  }
}

export class FileTooLargeError extends BotError {
  constructor(message = "File is too large for Telegram") {
    super("FILE_TOO_LARGE", message);
  }
}

export class NetworkError extends BotError {
  constructor(message = "Network error") {
    super("NETWORK_ERROR", message);
  }
}

export class DependencyMissingError extends BotError {
  constructor(message = "Server dependency is missing") {
    super("DEPENDENCY_MISSING", message);
  }
}

export class ProcessingUnavailableError extends BotError {
  constructor(message = "Processing unavailable") {
    super("PROCESSING_UNAVAILABLE", message);
  }
}

export class OverlayMissingError extends BotError {
  constructor(message = "Overlay file is missing") {
    super("OVERLAY_MISSING", message);
  }
}

export class ProcessingTimeoutError extends BotError {
  constructor(message = "Processing timed out") {
    super("PROCESSING_TIMEOUT", message);
  }
}

export class ProcessingFailedError extends BotError {
  constructor(message = "Processing failed") {
    super("PROCESSING_FAILED", message);
  }
}

export function userMessageForError(error: unknown): string {
  if (error instanceof BotError) {
    switch (error.code) {
      case "INVALID_URL":
        return "Invalid URL";
      case "UNSUPPORTED_SOURCE":
        return "Source is not supported";
      case "TIMEOUT":
        return "Request timed out";
      case "FILE_TOO_LARGE":
        return "File is too large for Telegram";
      case "NETWORK_ERROR":
        return "Network error. Please try again.";
      case "DEPENDENCY_MISSING":
        return "Server is missing TikTok downloader dependency";
      case "PROCESSING_UNAVAILABLE":
        return "Processing unavailable";
      case "OVERLAY_MISSING":
        return "Overlay file is missing on server";
      case "PROCESSING_TIMEOUT":
        return "Processing timeout";
      case "PROCESSING_FAILED":
        return "Processing failed (possibly corrupted input)";
      default:
        return "Unable to process this link";
    }
  }

  return "Unable to process this link";
}
