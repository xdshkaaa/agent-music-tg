import { Hono } from "hono";
import { env } from "./env";
import { openDb } from "./db";
import { bootstrapAllowlist } from "./lib/access-control";
import { createSpotifyOAuthRoutes } from "./spotify/oauth";
import { createBot, webhookPath } from "./bot";
import { webhookCallback } from "grammy";
import { createApiRoutes } from "./api/routes";

const db = openDb(env.dbPath);
bootstrapAllowlist(db);

const app = new Hono();

app.get("/healthz", (c) => c.json({ ok: true }));

app.route("/spotify", createSpotifyOAuthRoutes(db));
app.route("/api", createApiRoutes(db));

const bot = createBot(db);
app.post(webhookPath, webhookCallback(bot, "hono"));

export default {
  port: env.port,
  fetch: app.fetch,
};
