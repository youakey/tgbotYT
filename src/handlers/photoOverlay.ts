import { Context } from "telegraf";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import axios from "axios";
import {
  isUserWaitingForOverlay,
  setUserWaitingForOverlay,
  storeCustomOverlay,
  setUserOverlay
} from "../services/processingSettingsService";
import { createTempFilePathForPrefix } from "../services/tempFileService";
import { logger } from "../utils/logger";
import { config } from "../config";

type PhotoContext = Context & {
  chat?: {
    id: number;
  };
  message?: {
    photo?: Array<{
      file_id: string;
      file_size?: number;
    }>;
  };
};

const MAX_OVERLAY_SIZE_MB = 10;
const MAX_OVERLAY_SIZE_BYTES = MAX_OVERLAY_SIZE_MB * 1024 * 1024;

export async function handlePhotoOverlay(ctx: PhotoContext): Promise<void> {
  if (!ctx.chat?.id) {
    return;
  }

  if (!isUserWaitingForOverlay(ctx.chat.id)) {
    return;
  }

  const photos = ctx.message?.photo;
  if (!photos || photos.length === 0) {
    return;
  }

  const largestPhoto = photos[photos.length - 1];
  const fileSize = largestPhoto.file_size || 0;

  if (fileSize > MAX_OVERLAY_SIZE_BYTES) {
    await ctx.reply(`Photo is too large. Maximum size is ${MAX_OVERLAY_SIZE_MB}MB.`);
    return;
  }

  try {
    setUserWaitingForOverlay(ctx.chat.id, false);

    const file = await ctx.telegram.getFile(largestPhoto.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;

    const tempPath = createTempFilePathForPrefix(`overlay_${ctx.chat.id}`, ".jpg");
    const writeStream = createWriteStream(tempPath);

    const response = await axios.get(fileUrl, {
      responseType: "stream"
    });

    await pipeline(response.data, writeStream);

    storeCustomOverlay(ctx.chat.id, tempPath);
    setUserOverlay(ctx.chat.id, "custom");

    await ctx.reply(
      "Custom background saved! It will be used for your next video links. To change it, use /settings again."
    );

    logger.info({ chatId: ctx.chat.id, filePath: tempPath }, "Custom overlay uploaded");
  } catch (error) {
    logger.error({ error, chatId: ctx.chat.id }, "Failed to process photo overlay");
    await ctx.reply("Failed to process your photo. Please try again.");
    setUserWaitingForOverlay(ctx.chat.id, false);
  }
}
