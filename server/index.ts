import { Hono } from "hono";
import { env } from "./env";
import { openDb } from "./db";
import { bootstrapAllowlist } from "./lib/access-control";
import { createSpotifyOAuthRoutes } from "./spotify/oauth";
import { createBot } from "./bot";
import { createApiRoutes } from "./api/routes";

const db = openDb(env.dbPath);
bootstrapAllowlist(db);

const app = new Hono();

app.get("/healthz", (c) => c.json({ ok: true }));

app.route("/spotify", createSpotifyOAuthRoutes(db));
app.route("/api", createApiRoutes(db));

// Long-polling, not a webhook: no public route needed for the bot itself,
// only the Mini App + its API (see design.md — matches this VPS's existing
// fox-nails-bot convention). Runs concurrently with the HTTP server below.
const bot = createBot(db);
bot.start();

export default {
  port: env.port,
  fetch: app.fetch,
};
