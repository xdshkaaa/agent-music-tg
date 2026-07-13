import { Hono } from "hono";
import type { AppDb } from "../db";
import type { AppEnv } from "./context";
import { requireAuth, requireAdmin } from "./middleware";
import { startSpotifyLink } from "../spotify/oauth";
import { hasLinkedSpotify, getValidAccessToken } from "../spotify/tokens";
import { SpotifyClient } from "../spotify/client";
import { AVAILABLE_PROVIDERS, isProviderId } from "../agent/registry";
import { AVAILABLE_BACKENDS, isMusicBackend } from "../music/registry";
import { getActiveProviderId, setActiveProviderId, getActiveBackendId, setActiveBackendId } from "../lib/settings";
import { getPendingClarify, setPendingClarify, clearSession } from "../bot/session";
import { startGeneration, resumeGeneration } from "../core/run-generation";

const DEFAULT_PROVIDER = "opencode";
const DEFAULT_BACKEND = "youtube-music";

async function readJsonBody<T extends Record<string, unknown>>(req: Request): Promise<Partial<T>> {
  try {
    return (await req.json()) as Partial<T>;
  } catch {
    return {};
  }
}

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

  // --- Admin-only: active AI provider / music backend -----------------
  // Enforced by requireAdmin below, independent of whether the Mini App
  // renders this screen for the calling chat.

  app.get("/admin/settings", requireAdmin, (c) => {
    return c.json({
      activeProvider: getActiveProviderId(db, DEFAULT_PROVIDER),
      activeBackend: getActiveBackendId(db, DEFAULT_BACKEND),
      availableProviders: AVAILABLE_PROVIDERS,
      availableBackends: AVAILABLE_BACKENDS,
    });
  });

  app.post("/admin/settings/provider", requireAdmin, async (c) => {
    const body = await readJsonBody<{ id: string }>(c.req.raw);
    if (!body.id || !isProviderId(body.id)) {
      return c.json({ error: `id must be one of: ${AVAILABLE_PROVIDERS.join(", ")}` }, 400);
    }
    setActiveProviderId(db, body.id);
    return c.json({ activeProvider: body.id });
  });

  app.post("/admin/settings/backend", requireAdmin, async (c) => {
    const body = await readJsonBody<{ id: string }>(c.req.raw);
    if (!body.id || !isMusicBackend(body.id)) {
      return c.json({ error: `id must be one of: ${AVAILABLE_BACKENDS.join(", ")}` }, 400);
    }
    setActiveBackendId(db, body.id);
    return c.json({ activeBackend: body.id });
  });

  // --- Playlist generation ---------------------------------------------

  app.post("/generate", async (c) => {
    const chatId = c.get("chatId");
    const body = await readJsonBody<{ prompt: string }>(c.req.raw);
    if (!body.prompt || body.prompt.trim().length === 0) {
      return c.json({ error: "prompt is required" }, 400);
    }
    const outcome = await startGeneration(db, chatId, body.prompt.trim());
    if (outcome.status === "clarify") {
      setPendingClarify(db, chatId, {
        kind: "awaiting_clarify",
        messages: outcome.messages,
        question: outcome.question,
        options: outcome.options,
      });
      return c.json({ status: "clarify", question: outcome.question, options: outcome.options });
    }
    clearSession(db, chatId);
    return c.json(outcome);
  });

  app.post("/generate/resume", async (c) => {
    const chatId = c.get("chatId");
    const body = await readJsonBody<{ answer: string }>(c.req.raw);
    const pending = getPendingClarify(db, chatId);
    if (!pending) return c.json({ error: "no pending clarification for this chat" }, 400);
    if (!body.answer || body.answer.trim().length === 0) {
      return c.json({ error: "answer is required" }, 400);
    }
    const outcome = await resumeGeneration(db, chatId, "", pending.messages, body.answer.trim());
    if (outcome.status === "clarify") {
      setPendingClarify(db, chatId, {
        kind: "awaiting_clarify",
        messages: outcome.messages,
        question: outcome.question,
        options: outcome.options,
      });
      return c.json({ status: "clarify", question: outcome.question, options: outcome.options });
    }
    clearSession(db, chatId);
    return c.json(outcome);
  });

  // --- Spotify Connect playback control ---------------------------------

  app.post("/spotify/play", async (c) => {
    const chatId = c.get("chatId");
    const body = await readJsonBody<{ uri: string }>(c.req.raw);
    const token = await getValidAccessToken(db, chatId);
    const client = new SpotifyClient(token);
    if (body.uri) await client.play(body.uri);
    else await client.resume();
    return c.json({ ok: true });
  });

  app.post("/spotify/pause", async (c) => {
    const client = new SpotifyClient(await getValidAccessToken(db, c.get("chatId")));
    await client.pause();
    return c.json({ ok: true });
  });

  app.post("/spotify/next", async (c) => {
    const client = new SpotifyClient(await getValidAccessToken(db, c.get("chatId")));
    await client.next();
    return c.json({ ok: true });
  });

  app.post("/spotify/previous", async (c) => {
    const client = new SpotifyClient(await getValidAccessToken(db, c.get("chatId")));
    await client.previous();
    return c.json({ ok: true });
  });

  app.post("/spotify/volume", async (c) => {
    const body = await readJsonBody<{ percent: number }>(c.req.raw);
    if (typeof body.percent !== "number") return c.json({ error: "percent is required" }, 400);
    const client = new SpotifyClient(await getValidAccessToken(db, c.get("chatId")));
    await client.setVolume(body.percent);
    return c.json({ ok: true });
  });

  app.get("/spotify/now-playing", async (c) => {
    const client = new SpotifyClient(await getValidAccessToken(db, c.get("chatId")));
    const state = await client.getCurrentlyPlaying();
    return c.json(state);
  });

  return app;
}
