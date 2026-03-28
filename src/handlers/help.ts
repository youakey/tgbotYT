import { Context } from "telegraf";

export async function handleHelp(ctx: Context): Promise<void> {
  await ctx.reply([
    "Available commands:",
    "/start - Quick start and usage",
    "/help - Show command list",
    "/settings - Open processing settings",
    "/options - Alias for /settings"
  ].join("\n"));
}