import type { Bot } from "grammy";
import type { BotContext } from "./context";
import { env } from "../env";

/**
 * Optional Telegram Premium custom-emoji integration.
 *
 * When `EMOJI_STICKER_SET` is set, `loadCustomEmojis(bot)` fetches the named
 * sticker set once at startup and pairs each sticker's `custom_emoji_id` with
 * a symbolic name read from `emoji-symbols.json` (which maps
 * `custom_emoji_id → symbol`). The resulting `symbol → custom_emoji_id` map
 * is cached for the process lifetime.
 *
 * Surfaces (per the telegram-premium-emoji skill):
 *  - Message text: `accent(symbol)` returns a `<tg-emoji emoji-id="ID">…</tg-emoji>`
 *    HTML tag for use with `parse_mode: "HTML"`. When unmapped, returns the
 *    empty string — no bare unicode emoji is shipped in bot message text.
 *  - Inline buttons: `btnText(label, symbol)` returns `{ text, icon_custom_emoji_id? }`
 *    to pass as the first arg to grammy's `InlineKeyboard.text/webApp/url`.
 *    Button text stays clean — the premium emoji lives in
 *    `icon_custom_emoji_id`, never prepended to the label. When unmapped,
 *    returns `{ text: label }` (clean text, no emoji).
 *
 * When `EMOJI_STICKER_SET` is unset (or the fetch fails, or a symbol is not
 * mapped), bot messages use clean text with no emoji — the redesign's visual
 * identity lives in the Mini App regardless; the bot side unlocks the purple
 * glyphs once the sticker set is configured.
 */

/** Unicode fallback glyphs used as the visible inner text of <tg-emoji> tags. */
const FALLBACK: Record<string, string> = {
  info: "ℹ️",
  diamond: "💎",
  music: "🎵",
  stats: "📊",
  package: "📦",
  broadcast: "📨",
  gear: "⚙️",
  check: "✅",
  profile: "👤",
  wallet: "💳",
  plus: "➕",
  ruler: "📏",
  sparkle: "⚡",
  gift: "🎁",
  cross: "❌",
  warning: "⚠️",
  prohibited: "🚫",
  headphone: "🎧",
  crown: "👑",
  key: "🔑",
  link: "🔗",
  success_on: "🟢",
  success_off: "🔴",
};

/**
 * Unicode fallback for a symbol. Used only as the inner visible text of a
 * `<tg-emoji>` tag (which Telegram replaces with the sticker image at render
 * time). Never shipped as bare text in bot messages or button labels.
 */
export function fallbackSymbol(symbol: string): string {
  return FALLBACK[symbol] ?? symbol;
}

const symbolToEmojiId = new Map<string, string>();

let loaded = false;

/**
 * Fetches the bot's custom-emoji sticker set once and populates
 * `symbolToEmojiId` from the `emoji-symbols.json` convention file.
 * Safe to call multiple times — only the first call does the fetch.
 */
export async function loadCustomEmojis(bot: Bot<BotContext>): Promise<void> {
  if (loaded) return;
  loaded = true;
  const setName = env.emojiStickerSet.trim();
  if (!setName) return;
  let symbolsFile: Record<string, string>;
  try {
    const fs = await import("node:fs");
    const filePath = new URL("./emoji-symbols.json", import.meta.url);
    const text = fs.readFileSync(filePath, "utf8");
    symbolsFile = JSON.parse(text) as Record<string, string>;
  } catch {
    return; // no convention file → no mapping; clean-text fallback will be used
  }
  // Build custom_emoji_id → symbol lookup, skipping the comment/example keys.
  const idToSymbol = new Map<string, string>();
  for (const [id, sym] of Object.entries(symbolsFile)) {
    if (id.startsWith("_")) continue;
    if (typeof sym !== "string" || sym.startsWith("_")) continue;
    idToSymbol.set(id, sym);
  }
  if (idToSymbol.size === 0) return;
  try {
    const set = await bot.api.getStickerSet(setName);
    for (const sticker of set.stickers) {
      const id = sticker.custom_emoji_id;
      if (!id) continue;
      const sym = idToSymbol.get(id);
      if (sym) symbolToEmojiId.set(sym, id);
    }
  } catch {
    // sticker set not found / not owned by bot → leave map empty
  }
}

/**
 * Returns the inline-button first-arg object: `{ text, icon_custom_emoji_id?, style? }`.
 * When `symbol` is mapped, `icon_custom_emoji_id` is set (Telegram renders the
 * bot's custom-emoji glyph before the label). When unmapped, the object carries
 * clean text only — no bare unicode emoji is shipped in button labels. An
 * optional `style` ("danger" | "success" | "primary") may be passed to color
 * the button (e.g. active/inactive state), superseding status-flag emoji.
 *
 * Pass this as the first argument to grammy's `InlineKeyboard.text/webApp/url`.
 */
export function btnText(
  label: string,
  symbol: string,
  style?: "danger" | "success" | "primary",
): { text: string; icon_custom_emoji_id?: string; style?: "danger" | "success" | "primary" } {
  const id = symbolToEmojiId.get(symbol);
  const obj: { text: string; icon_custom_emoji_id?: string; style?: "danger" | "success" | "primary" } = {
    text: label,
  };
  if (id) obj.icon_custom_emoji_id = id;
  if (style) obj.style = style;
  return obj;
}

/**
 * Returns a `<tg-emoji emoji-id="ID">fallback</tg-emoji>` HTML tag wrapping
 * the matching unicode fallback glyph (Telegram replaces it with the sticker
 * image at render time), for use inside bot message bodies parsed with
 * `parse_mode: "HTML"`. When `symbol` is unmapped, returns the empty string
 * — no bare unicode is shipped in message text.
 *
 * Callers should conditionally prefix the result, e.g.:
 *   const a = accent("info"); `${a ? a + " " : ""}<b>AGENT MUSIC</b>`
 */
export function accent(symbol: string): string {
  const id = symbolToEmojiId.get(symbol);
  if (id) return `<tg-emoji emoji-id="${id}">${fallbackSymbol(symbol)}</tg-emoji>`;
  return "";
}

/** Convenience: builds `${accent ? accent + " " + text : text}` for headings. */
export function heading(symbol: string, text: string): string {
  const a = accent(symbol);
  return a ? `${a} ${text}` : text;
}

/** Test-only: clears the cached map and the loaded flag. */
export function __resetForTests(): void {
  symbolToEmojiId.clear();
  loaded = false;
}

/** Test-only: injects a symbol → custom_emoji_id mapping directly. */
export function __setEmojiForTests(symbol: string, id: string): void {
  symbolToEmojiId.set(symbol, id);
  loaded = true;
}
