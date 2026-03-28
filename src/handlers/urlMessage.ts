import { Context } from "telegraf";
import { parseAndValidateUrl } from "../services/urlValidationService";
import { DownloadQueueAdapter } from "../jobs/queue";
import { createTempPrefix } from "../services/tempFileService";
import { getUserProcessingSettings, resolveOverlayPath } from "../services/processingSettingsService";
import { userMessageForError } from "../utils/errors";

const URL_MATCH = /https:\/\/[^\s]+/i;

type TextContext = Context & {
  message?: {
    text?: string;
  };
  chat?: {
    id: number;
  };
};

export async function handleUrlMessage(ctx: TextContext, queue: DownloadQueueAdapter): Promise<void> {
  const text = ctx.message?.text?.trim() || "";
  if (!text || text.startsWith("/")) {
    return;
  }

  const match = text.match(URL_MATCH);
  if (!match) {
    await ctx.reply("Invalid URL");
    return;
  }

  try {
    parseAndValidateUrl(match[0]);
  } catch (error) {
    await ctx.reply(userMessageForError(error));
    return;
  }

  const processing = await ctx.reply("Processing...");
  const prefix = createTempPrefix();
  const chatId = ctx.chat?.id || 0;
  const settings = getUserProcessingSettings(chatId);

  await queue.add({
    chatId,
    url: match[0],
    statusMessageId: processing.message_id,
    prefix,
    mirrorVideo: settings.mirrorVideo,
    overlayPath: resolveOverlayPath(chatId, settings.overlayId)
  });
}
