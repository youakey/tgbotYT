import { mkdir, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config";

export async function ensureTempDir(): Promise<void> {
  await mkdir(config.tempDir, { recursive: true, mode: 0o700 });
}

export function createTempFilePath(extension: string): string {
  const safeExt = extension.startsWith(".") ? extension : `.${extension}`;
  const fileName = `video_${Date.now()}_${randomUUID()}${safeExt}`;
  return path.join(config.tempDir, fileName);
}

export function createTempFilePathForPrefix(prefix: string, extension: string): string {
  const safeExt = extension.startsWith(".") ? extension : `.${extension}`;
  return path.join(config.tempDir, `${prefix}${safeExt}`);
}

export function createTempPrefix(): string {
  return `video_${Date.now()}_${randomUUID()}`;
}

export function createTempOutputTemplate(prefix: string): string {
  return path.join(config.tempDir, `${prefix}.%(ext)s`);
}

export async function cleanupFilesByPrefix(prefix: string): Promise<void> {
  try {
    const entries = await readdir(config.tempDir);
    const toDelete = entries.filter((name) => name.startsWith(`${prefix}.`));

    await Promise.all(
      toDelete.map(async (name) => {
        await safeDeleteFile(path.join(config.tempDir, name));
      })
    );
  } catch {
    // Ignore cleanup failures.
  }
}

export async function safeDeleteFile(filePath: string | null): Promise<void> {
  if (!filePath) {
    return;
  }

  try {
    await unlink(filePath);
  } catch {
    // Ignore cleanup failures.
  }
}
