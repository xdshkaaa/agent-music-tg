import { Hono } from "hono";
import type { AppDb } from "../db";
import type { AppEnv } from "./context";
import { isMusicFeedbackEvent, recordMusicFeedback } from "../access/music-feedback-store";

const TRACK_URI_RE = /^(?:ytm|sc):[A-Za-z0-9:_-]{1,300}$/;

/** Auth is provided by createApiRoutes' parent middleware. */
export function createFeedbackRoutes(db: AppDb): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.post("/music-feedback", async (c) => {
    const body = await c.req.json().catch(() => null);
    const event = body?.event;
    const uri = typeof body?.uri === "string" ? body.uri.trim() : "";
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const artist = typeof body?.artist === "string" ? body.artist.trim() : "";

    if (
      !isMusicFeedbackEvent(event) ||
      !TRACK_URI_RE.test(uri) ||
      title.length === 0 ||
      title.length > 300 ||
      artist.length === 0 ||
      artist.length > 300
    ) {
      return c.json({ error: "invalid music feedback" }, 400);
    }

    recordMusicFeedback(db, c.get("chatId"), event, { uri, title, artist });
    return c.json({ ok: true });
  });

  return app;
}
