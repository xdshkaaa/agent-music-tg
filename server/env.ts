function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function bool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === "") return fallback;
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

function splitChatIds(raw: string | undefined): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const n = Number(s);
      if (!Number.isFinite(n)) throw new Error(`Invalid chat id in env: ${s}`);
      return n;
    });
}

export const env = {
  telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
  allowlistChatIds: splitChatIds(process.env.ALLOWLIST_CHAT_IDS),
  adminChatIds: splitChatIds(process.env.ADMIN_CHAT_IDS),
  publicOrigin: (process.env.PUBLIC_ORIGIN ?? "https://miniapp.xdshka.party").replace(/\/+$/, ""),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openrouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
  opencodeApiKey: process.env.OPENCODE_API_KEY ?? "",
  opencodeBaseUrl: process.env.OPENCODE_BASE_URL ?? "https://opencode.ai/zen/v1",
  opencodeModel: process.env.OPENCODE_MODEL ?? "claude-sonnet-5",
  ollamaUrl: process.env.OLLAMA_URL ?? "http://127.0.0.1:11434",
  ollamaModel: process.env.OLLAMA_MODEL ?? "llama3",
  port: Number(process.env.PORT ?? "8787"),
  dbPath: process.env.DB_PATH ?? "./data/app.sqlite",
  // CryptoBot Crypto Pay — payments feature. Token is required only when
  // paymentsEnabled is true; validated lazily by the payments client.
  paymentsEnabled: bool(process.env.PAYMENTS_ENABLED, true),
  cryptobotToken: process.env.CRYPTOBOT_TOKEN ?? "",
  cryptobotNetwork: (process.env.CRYPTOBOT_NETWORK ?? "mainnet").trim().toLowerCase() === "testnet" ? "testnet" : "mainnet",
  // Optional Telegram Premium custom-emoji sticker set owned by the bot.
  // When set, server/bot/emoji.ts fetches it once at startup and resolves
  // symbolic names → custom_emoji_id for inline-button labels and <tg-emoji>
  // message decorations. When unset, plain unicode emoji fallbacks are used.
  emojiStickerSet: process.env.EMOJI_STICKER_SET ?? "",
  // Audio download/streaming: yt-dlp scratch dir (files deleted after upload)
  // and the on-disk stream cache with LRU size cap + TTL.
  audioScratchDir: process.env.AUDIO_SCRATCH_DIR ?? "./data/audio-scratch",
  streamCacheDir: process.env.STREAM_CACHE_DIR ?? "./data/stream-cache",
  streamCacheMaxBytes: Number(process.env.STREAM_CACHE_MAX_BYTES ?? String(200 * 1024 * 1024)),
  streamCacheTtlSeconds: Number(process.env.STREAM_CACHE_TTL_SECONDS ?? String(24 * 60 * 60)),
};
