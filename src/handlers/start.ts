import { Context } from "telegraf";

export async function handleStart(ctx: Context): Promise<void> {
  await ctx.reply(
    "Send me a direct video link. I will return the processed video. Use /help to view all commands. Optional: use /settings to change mirror and overlay."
  );
}
