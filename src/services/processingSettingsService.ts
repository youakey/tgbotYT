import path from "node:path";
import { config } from "../config";

export type OverlayOptionId = "default" | "alt" | "custom";

export type UserProcessingSettings = {
  mirrorVideo: boolean;
  overlayId: OverlayOptionId;
  customOverlayPath?: string;
};

export const defaultProcessingSettings: UserProcessingSettings = {
  mirrorVideo: true,
  overlayId: "default"
};

const overlayPaths: Record<Exclude<OverlayOptionId, "custom">, string> = {
  default: config.overlayPath,
  alt: path.resolve(process.cwd(), "assets/shorts-overlay1.png")
};

const overlayLabels: Record<Exclude<OverlayOptionId, "custom">, string> = {
  default: "Background 1",
  alt: "Background 2"
};

const chatSettings = new Map<number, UserProcessingSettings>();
const userWaitingForOverlay = new Set<number>();
const customOverlayStorage = new Map<number, string>();

export function getUserProcessingSettings(chatId: number): UserProcessingSettings {
  const stored = chatSettings.get(chatId);
  if (!stored) {
    return { ...defaultProcessingSettings };
  }
  return { ...stored };
}

export function setUserMirror(chatId: number, mirrorVideo: boolean): UserProcessingSettings {
  const next = {
    ...getUserProcessingSettings(chatId),
    mirrorVideo
  };
  chatSettings.set(chatId, next);
  return next;
}

export function setUserOverlay(chatId: number, overlayId: OverlayOptionId): UserProcessingSettings {
  const next = {
    ...getUserProcessingSettings(chatId),
    overlayId
  };
  chatSettings.set(chatId, next);
  return next;
}

export function resetUserProcessingSettings(chatId: number): UserProcessingSettings {
  chatSettings.delete(chatId);
  return { ...defaultProcessingSettings };
}

export function resolveOverlayPath(chatId: number, overlayId: OverlayOptionId): string {
  if (overlayId === "custom") {
    const customPath = getUserCustomOverlayPath(chatId);
    return customPath || config.overlayPath;
  }
  return overlayPaths[overlayId] || config.overlayPath;
}

export function overlayLabel(overlayId: OverlayOptionId): string {
  if (overlayId === "custom") {
    return "Custom Background ✅";
  }
  return overlayLabels[overlayId] || overlayLabels.default;
}

export function allOverlayOptions(): Array<{ id: Exclude<OverlayOptionId, "custom">; label: string }> {
  return [
    { id: "default", label: overlayLabels.default },
    { id: "alt", label: overlayLabels.alt }
  ];
}

export function setUserWaitingForOverlay(chatId: number, waiting: boolean): void {
  if (waiting) {
    userWaitingForOverlay.add(chatId);
  } else {
    userWaitingForOverlay.delete(chatId);
  }
}

export function isUserWaitingForOverlay(chatId: number): boolean {
  return userWaitingForOverlay.has(chatId);
}

export function storeCustomOverlay(chatId: number, filePath: string): void {
  customOverlayStorage.set(chatId, filePath);
}

export function getUserCustomOverlayPath(chatId: number): string | undefined {
  return customOverlayStorage.get(chatId);
}

export function clearUserCustomOverlay(chatId: number): void {
  customOverlayStorage.delete(chatId);
}