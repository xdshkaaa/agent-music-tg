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

/**
 * Config for the standalone operator dashboard process (server/dashboard-server.ts).
 * Deliberately separate from server/env.ts — this process never touches the
 * bot/API's write path, it opens both environments' sqlite files read-only
 * and verifies its own login-widget session, so it has its own tiny env
 * surface rather than requiring the full bot .env.
 */
export const dashEnv = {
  port: Number(process.env.DASH_PORT ?? "8789"),
  // HMAC key for the Telegram Login Widget verification (same bot as prod,
  // per Telegram's login widget docs — one widget, one bot).
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME ?? "",
  // Chat ids allowed to sign in to the dashboard. Defaults to the same admin
  // set as the bot; override with DASH_ADMIN_CHAT_IDS if the dashboard
  // audience should differ.
  adminChatIds: splitChatIds(process.env.DASH_ADMIN_CHAT_IDS ?? process.env.ADMIN_CHAT_IDS),
  // Secret used to sign the session cookie. Required in production.
  sessionSecret: process.env.DASH_SESSION_SECRET ?? "",
  // Read-only sqlite paths for each environment. Point these at the *live*
  // files (WAL mode allows concurrent external readers) — see README "Infra
  // on the VPS" / deploy/deploy-test.sh for where each one lives.
  prodDbPath: process.env.DASH_PROD_DB_PATH ?? "/opt/agent-music-tg/current/data/app.sqlite",
  devDbPath: process.env.DASH_DEV_DB_PATH ?? "/opt/agent-music-tg-test/data/app.sqlite",
  publicOrigin: (process.env.DASH_PUBLIC_ORIGIN ?? "https://dash.xdshka.party").replace(/\/+$/, ""),
};
