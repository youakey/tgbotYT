import { Context, Markup } from "telegraf";
import {
  allOverlayOptions,
  clearUserCustomOverlay,
  getUserCustomOverlayPath,
  getUserProcessingSettings,
  overlayLabel,
  OverlayOptionId,
  resetUserProcessingSettings,
  setUserMirror,
  setUserOverlay,
  setUserWaitingForOverlay,
  UserProcessingSettings
} from "../services/processingSettingsService";

const ACTION_PREFIX = "settings:";

type SettingsContext = Context & {
  chat?: {
    id: number;
  };
  callbackQuery?: {
    data?: string;
  };
};

function settingsText(chatId: number, settings: UserProcessingSettings): string {
  const mirror = settings.mirrorVideo ? "On" : "Off";
  const hasCustomOverlay = Boolean(getUserCustomOverlayPath(chatId));
  const customOverlayHint = hasCustomOverlay ? "Uploaded" : "Not uploaded";
  return [
    "Processing settings:",
    `- Mirror video: ${mirror}`,
    `- Overlay: ${overlayLabel(settings.overlayId)}`,
    `- Custom overlay file: ${customOverlayHint}`,
    "",
    "These settings are optional and used only for your next links."
  ].join("\n");
}

function settingsKeyboard(chatId: number, settings: UserProcessingSettings) {
  const mirrorButton = Markup.button.callback(
    `Mirror: ${settings.mirrorVideo ? "On" : "Off"}`,
    `${ACTION_PREFIX}mirror:${settings.mirrorVideo ? "off" : "on"}`
  );

  const overlayButtons = allOverlayOptions().map((option) =>
    Markup.button.callback(
      `${option.label}${settings.overlayId === option.id ? " ✅" : ""}`,
      `${ACTION_PREFIX}overlay:${option.id}`
    )
  );

  const customButton = Markup.button.callback(
    `${overlayLabel("custom")}${settings.overlayId === "custom" ? "" : " (upload)"}`,
    `${ACTION_PREFIX}upload-overlay`
  );

  return Markup.inlineKeyboard([
    [mirrorButton],
    overlayButtons,
    [customButton],
    [Markup.button.callback("Reset defaults", `${ACTION_PREFIX}reset`)]
  ]);
}

async function sendOrUpdateSettingsView(ctx: SettingsContext, settings: UserProcessingSettings): Promise<void> {
  if (!ctx.chat?.id) {
    return;
  }
  const text = settingsText(ctx.chat.id, settings);
  const keyboard = settingsKeyboard(ctx.chat.id, settings);

  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(text, keyboard);
    } catch {
      // Ignore edit errors (for example if message did not change).
    }
    await ctx.answerCbQuery();
    return;
  }

  await ctx.reply(text, keyboard);
}

export async function handleSettingsCommand(ctx: SettingsContext): Promise<void> {
  if (!ctx.chat?.id) {
    return;
  }

  const settings = getUserProcessingSettings(ctx.chat.id);
  await sendOrUpdateSettingsView(ctx, settings);
}

export async function handleSettingsAction(ctx: SettingsContext): Promise<void> {
  if (!ctx.chat?.id) {
    return;
  }

  const payload = ctx.callbackQuery?.data;
  if (!payload || !payload.startsWith(ACTION_PREFIX)) {
    return;
  }

  const action = payload.slice(ACTION_PREFIX.length);

  if (action === "mirror:on") {
    const settings = setUserMirror(ctx.chat.id, true);
    await sendOrUpdateSettingsView(ctx, settings);
    return;
  }

  if (action === "mirror:off") {
    const settings = setUserMirror(ctx.chat.id, false);
    await sendOrUpdateSettingsView(ctx, settings);
    return;
  }

  if (action === "reset") {
    const settings = resetUserProcessingSettings(ctx.chat.id);
    clearUserCustomOverlay(ctx.chat.id);
    setUserWaitingForOverlay(ctx.chat.id, false);
    await sendOrUpdateSettingsView(ctx, settings);
    return;
  }

  if (action.startsWith("overlay:")) {
    const overlayId = action.split(":")[1] as OverlayOptionId;
    if (overlayId !== "default" && overlayId !== "alt") {
      await ctx.answerCbQuery("Unknown overlay option", { show_alert: true });
      return;
    }

    const settings = setUserOverlay(ctx.chat.id, overlayId);
    setUserWaitingForOverlay(ctx.chat.id, false);
    await sendOrUpdateSettingsView(ctx, settings);
    return;
  }

  if (action === "upload-overlay") {
    await ctx.answerCbQuery();
    setUserWaitingForOverlay(ctx.chat.id, true);
    await ctx.reply("Please send me a photo to use as your custom background. It will be used as an overlay for your videos.");
    return;
  }
}