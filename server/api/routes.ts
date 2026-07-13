import { Hono } from "hono";
import type { AppDb } from "../db";
import type { AppEnv } from "./context";
import { requireAuth, requireAdmin } from "./middleware";
import { startSpotifyLink } from "../spotify/oauth";
import { hasLinkedSpotify } from "../spotify/tokens";

export function createApiRoutes(db: AppDb): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("*", requireAuth(db));

  app.get("/me", (c) => {
    return c.json({ chatId: c.get("chatId"), isAdmin: c.get("isAdmin") });
  });

  app.get("/spotify/status", (c) => {
    return c.json({ linked: hasLinkedSpotify(db, c.get("chatId")) });
  });

  app.post("/spotify/link", (c) => {
    const url = startSpotifyLink(db, c.get("chatId"));
    return c.json({ url });
  });

  // Placeholder — admin-only routes wired here as later task groups land.
  app.get("/admin/ping", requireAdmin, (c) => c.json({ ok: true }));

  return app;
}
