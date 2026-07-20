import type { AppDb } from "../db";
import { listUsers, type User } from "../access/users-store";

export interface BroadcastResult {
  sent: number;
  failed: number;
}

export const BROADCAST_BUTTON_PRESETS = ["open_app", "search", "playlists", "profile"] as const;
export type BroadcastButtonPreset = (typeof BROADCAST_BUTTON_PRESETS)[number];
export type BroadcastButtonStyle = "primary" | "success" | "danger";

export const BROADCAST_BUTTON_LABELS: Record<BroadcastButtonPreset, string> = {
  open_app: "Открыть приложение",
  search: "Поиск",
  playlists: "Мои плейлисты",
  profile: "Профиль",
};

export type BroadcastButton =
  | {
      kind: "preset";
      preset: BroadcastButtonPreset;
      text: string;
      style?: BroadcastButtonStyle;
    }
  | {
      kind: "url";
      text: string;
      url: string;
      style?: BroadcastButtonStyle;
    };
export type BroadcastMediaKind = "photo" | "animation" | "video" | "document";

export interface BroadcastMedia {
  kind: BroadcastMediaKind;
  data: Uint8Array;
  filename: string;
  mimeType: string;
}

export interface BroadcastMessage {
  text: string;
  buttons: readonly BroadcastButton[];
  media?: BroadcastMedia;
  parseMode?: "HTML";
}

export type BroadcastSendFn = (chatId: number, message: BroadcastMessage) => Promise<void>;

export const MAX_BROADCAST_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_BROADCAST_FILE_BYTES = 50 * 1024 * 1024;
export const BROADCAST_NAME_PLACEHOLDER = "{name}";

const SEND_DELAY_MS = 40; // ~25/s, under Telegram's ~30/s global limit
const BUTTON_PRESET_SET = new Set<string>(BROADCAST_BUTTON_PRESETS);
const BUTTON_STYLE_SET = new Set<string>(["primary", "success", "danger"]);
const MAX_BROADCAST_BUTTONS = 8;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Resolves the best available personal salutation for a broadcast recipient. */
export function broadcastRecipientName(user: Pick<User, "firstName" | "username">): string {
  const firstName = user.firstName?.trim();
  if (firstName) return firstName;
  const username = user.username?.trim().replace(/^@/, "");
  return username ? `@${username}` : "друг";
}

/** Replaces every {name} token without allowing a Telegram name to inject HTML. */
export function personalizeBroadcastMessage(message: BroadcastMessage, user: User): BroadcastMessage {
  if (!message.text.includes(BROADCAST_NAME_PLACEHOLDER)) return message;
  const rawName = broadcastRecipientName(user);
  const name = message.parseMode === "HTML" ? escapeHtml(rawName) : rawName;
  return {
    ...message,
    text: message.text.split(BROADCAST_NAME_PLACEHOLDER).join(name),
  };
}

function parseButtonStyle(value: unknown): BroadcastButtonStyle | undefined | null {
  if (value === undefined || value === null || value === "" || value === "default") return undefined;
  return typeof value === "string" && BUTTON_STYLE_SET.has(value)
    ? value as BroadcastButtonStyle
    : null;
}

function validButtonUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "tg:";
  } catch {
    return false;
  }
}

/**
 * Parses editable preset and custom URL buttons. Legacy arrays of preset ids
 * remain accepted so old bot-admin flows and saved clients keep working.
 */
export function parseBroadcastButtons(value: unknown): BroadcastButton[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_BROADCAST_BUTTONS) return null;
  const result: BroadcastButton[] = [];
  const seenPresets = new Set<BroadcastButtonPreset>();
  for (const item of value) {
    if (typeof item === "string") {
      if (!BUTTON_PRESET_SET.has(item)) return null;
      const preset = item as BroadcastButtonPreset;
      if (!seenPresets.has(preset)) {
        result.push({ kind: "preset", preset, text: BROADCAST_BUTTON_LABELS[preset] });
        seenPresets.add(preset);
      }
      continue;
    }
    if (!item || typeof item !== "object") return null;
    const candidate = item as Record<string, unknown>;
    const style = parseButtonStyle(candidate.style);
    if (style === null) return null;
    const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
    if (!text || text.length > 64) return null;

    if (candidate.kind === "preset") {
      if (typeof candidate.preset !== "string" || !BUTTON_PRESET_SET.has(candidate.preset)) return null;
      const preset = candidate.preset as BroadcastButtonPreset;
      if (!seenPresets.has(preset)) {
        result.push({ kind: "preset", preset, text, ...(style ? { style } : {}) });
        seenPresets.add(preset);
      }
      continue;
    }
    if (candidate.kind === "url") {
      const url = typeof candidate.url === "string" ? candidate.url.trim() : "";
      if (url.length > 2048 || !validButtonUrl(url)) return null;
      result.push({ kind: "url", text, url, ...(style ? { style } : {}) });
      continue;
    }
    return null;
  }
  return result;
}

/** @deprecated Use parseBroadcastButtons. */
export const parseBroadcastButtonPresets = parseBroadcastButtons;

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
      await send(user.chatId, personalizeBroadcastMessage(message, user));
      sent++;
    } catch {
      failed++;
    }
    await sleep(SEND_DELAY_MS);
  }
  return { sent, failed };
}
