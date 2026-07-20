import type { AppDb } from "../db";
import { listUsers } from "../access/users-store";

export interface BroadcastResult {
  sent: number;
  failed: number;
}

export const BROADCAST_BUTTON_PRESETS = ["open_app", "search", "playlists", "profile"] as const;
export type BroadcastButtonPreset = (typeof BROADCAST_BUTTON_PRESETS)[number];
export type BroadcastMediaKind = "photo" | "animation" | "video" | "document";

export interface BroadcastMedia {
  kind: BroadcastMediaKind;
  data: Uint8Array;
  filename: string;
  mimeType: string;
}

export interface BroadcastMessage {
  text: string;
  buttons: readonly BroadcastButtonPreset[];
  media?: BroadcastMedia;
  parseMode?: "HTML";
}

export type BroadcastSendFn = (chatId: number, message: BroadcastMessage) => Promise<void>;

export const MAX_BROADCAST_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_BROADCAST_FILE_BYTES = 50 * 1024 * 1024;

const SEND_DELAY_MS = 40; // ~25/s, under Telegram's ~30/s global limit
const BUTTON_PRESET_SET = new Set<string>(BROADCAST_BUTTON_PRESETS);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseBroadcastButtonPresets(value: unknown): BroadcastButtonPreset[] | null {
  if (!Array.isArray(value)) return null;
  const result: BroadcastButtonPreset[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !BUTTON_PRESET_SET.has(item)) return null;
    const preset = item as BroadcastButtonPreset;
    if (!result.includes(preset)) result.push(preset);
  }
  return result;
}

/** Chooses a Telegram-native presentation only when the uploaded format is supported. */
export function resolveBroadcastMediaKind(filename: string, mimeType: string): BroadcastMediaKind {
  const lowerName = filename.toLowerCase();
  const lowerType = mimeType.toLowerCase();
  if (lowerType && lowerType !== "application/octet-stream") {
    if (lowerType === "image/gif") return "animation";
    if (["image/jpeg", "image/png", "image/webp"].includes(lowerType)) return "photo";
    if (lowerType === "video/mp4") return "video";
    return "document";
  }
  if (lowerName.endsWith(".gif")) return "animation";
  if (/\.(jpe?g|png|webp)$/.test(lowerName)) return "photo";
  if (lowerName.endsWith(".mp4")) return "video";
  return "document";
}

export function validateBroadcastMessage(message: BroadcastMessage): string | null {
  if (!message.text && !message.media) return "Добавьте текст или вложение.";
  if (message.media) {
    if (message.text.length > 1024) return "Подпись к вложению должна быть не длиннее 1024 символов.";
    if (message.media.data.byteLength === 0) return "Вложение пустое.";
    if (message.media.kind === "photo" && message.media.data.byteLength > MAX_BROADCAST_PHOTO_BYTES) {
      return "Изображение должно быть не больше 10 МБ.";
    }
    if (message.media.kind !== "photo" && message.media.data.byteLength > MAX_BROADCAST_FILE_BYTES) {
      return "Вложение должно быть не больше 50 МБ.";
    }
  } else if (message.text.length > 4096) {
    return "Текст без вложения должен быть не длиннее 4096 символов.";
  }
  return null;
}

/**
 * Sends one prepared message to every recorded user, tolerating per-recipient
 * failures (blocked bot, deactivated account) and pacing global Bot API calls.
 */
export async function broadcast(
  db: AppDb,
  message: BroadcastMessage,
  send: BroadcastSendFn,
): Promise<BroadcastResult> {
  const users = listUsers(db);
  let sent = 0;
  let failed = 0;
  for (const user of users) {
    try {
      await send(user.chatId, message);
      sent++;
    } catch {
      failed++;
    }
    await sleep(SEND_DELAY_MS);
  }
  return { sent, failed };
}
