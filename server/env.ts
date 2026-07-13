function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
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
  telegramWebhookSecret: required("TELEGRAM_WEBHOOK_SECRET"),
  allowlistChatIds: splitChatIds(process.env.ALLOWLIST_CHAT_IDS),
  adminChatIds: splitChatIds(process.env.ADMIN_CHAT_IDS),
  publicOrigin: (process.env.PUBLIC_ORIGIN ?? "https://miniapp.xdshka.party").replace(/\/+$/, ""),
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openrouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
  ollamaUrl: process.env.OLLAMA_URL ?? "http://127.0.0.1:11434",
  ollamaModel: process.env.OLLAMA_MODEL ?? "llama3",
  port: Number(process.env.PORT ?? "8787"),
  dbPath: process.env.DB_PATH ?? "./data/app.sqlite",
};
