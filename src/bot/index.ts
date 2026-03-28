import { Telegraf } from "telegraf";
import { config } from "../config";
import { handleHelp } from "../handlers/help";
import { handlePhotoOverlay } from "../handlers/photoOverlay";
import { handleSettingsAction, handleSettingsCommand } from "../handlers/settings";
import { handleStart } from "../handlers/start";
import { handleUrlMessage } from "../handlers/urlMessage";
import { DownloadQueueAdapter } from "../jobs/queue";
import { logger } from "../utils/logger";

export function createBot(queue: DownloadQueueAdapter): Telegraf {
  const bot = new Telegraf(config.botToken);

  bot.start(async (ctx) => {
    await handleStart(ctx);
  });

  bot.command("help", async (ctx) => {
    await handleHelp(ctx);
  });

  bot.command("settings", async (ctx) => {
    await handleSettingsCommand(ctx);
  });

  bot.command("options", async (ctx) => {
    await handleSettingsCommand(ctx);
  });

  bot.action(/^settings:/, async (ctx) => {
    await handleSettingsAction(ctx);
  });

  bot.on("photo", async (ctx) => {
    await handlePhotoOverlay(ctx);
  });

  bot.on("text", async (ctx) => {
    await handleUrlMessage(ctx, queue);
  });

  bot.catch(async (error, ctx) => {
    logger.error({ error }, "Unhandled bot error");
    await ctx.reply("Unable to process this link");
  });

  return bot;
}
