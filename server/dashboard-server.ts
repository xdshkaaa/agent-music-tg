// Standalone operator dashboard backend (dash.xdshka.party). Runs as its own
// process, independent of the bot/API server(s) — it never writes, it opens
// each environment's sqlite file read-only (see server/dashboard/db.ts) and
// authenticates operators via the Telegram Login Widget instead of Mini App
// initData (see server/dashboard/auth.ts). See README "Operator dashboard"
// for the Caddy + Cloudflare Tunnel wiring this expects.
import { Hono } from "hono";
import { dashEnv } from "./dashboard/env";
import { openReadonlyDb } from "./dashboard/db";
import { createDashboardRoutes, type DashEnvId } from "./dashboard/routes";

if (!dashEnv.sessionSecret) {
  console.error("FATAL: DASH_SESSION_SECRET is required (see .env.example)");
  process.exit(1);
}
if (!dashEnv.telegramBotToken) {
  console.error("FATAL: TELEGRAM_BOT_TOKEN is required to verify the Telegram Login Widget");
  process.exit(1);
}
if (dashEnv.adminChatIds.length === 0) {
  console.warn("WARN: no admin chat ids configured (DASH_ADMIN_CHAT_IDS / ADMIN_CHAT_IDS) — nobody can log in");
}

const prodDb = openReadonlyDb(dashEnv.prodDbPath);
const devDb = openReadonlyDb(dashEnv.devDbPath);
if (!prodDb) console.warn(`WARN: prod db not found at ${dashEnv.prodDbPath} — prod tab will show "unavailable"`);
if (!devDb) console.warn(`WARN: dev db not found at ${dashEnv.devDbPath} — dev tab will show "unavailable"`);

const dbs: Record<DashEnvId, ReturnType<typeof openReadonlyDb>> = { prod: prodDb, dev: devDb };

const app = new Hono();
app.get("/healthz", (c) => c.json({ ok: true }));
app.route("/api", createDashboardRoutes(dbs));

export default {
  port: dashEnv.port,
  fetch: app.fetch,
};
