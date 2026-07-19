import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { AppDb } from "../db";
import type { AppEnv } from "./context";
import { getPendingClarify, setPendingClarify, clearSession } from "../bot/session";
import { startGeneration, resumeGeneration, extendGeneration, type GenerationOutcome } from "../core/run-generation";
import { readJsonBody, sseErrorOutcome } from "./shared";

type ClarifyOutcome = Extract<GenerationOutcome, { status: "clarify" }>;

/** Persists a clarify outcome as the chat's pending session so a resume can pick it back up. */
function rememberClarify(db: AppDb, chatId: number, originalPrompt: string, outcome: ClarifyOutcome): void {
  setPendingClarify(db, chatId, {
    kind: "awaiting_clarify",
    originalPrompt,
    messages: outcome.messages,
    question: outcome.question,
    options: outcome.options,
    round: outcome.round,
  });
}

/** Playlist generation: fresh generate, clarify resume, and extend — each in plain-JSON and SSE-stream form. */
export function createGenerationRoutes(db: AppDb): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.post("/generate", async (c) => {
    const chatId = c.get("chatId");
    const body = await readJsonBody<{ prompt: string }>(c.req.raw);
    if (!body.prompt || body.prompt.trim().length === 0) {
      return c.json({ error: "prompt is required" }, 400);
    }
    const prompt = body.prompt.trim();
    const outcome = await startGeneration(db, chatId, prompt);
    if (outcome.status === "clarify") {
      rememberClarify(db, chatId, prompt, outcome);
      return c.json({ status: "clarify", question: outcome.question, options: outcome.options });
    }
    clearSession(db, chatId);
    if (outcome.status === "rate_limited") return c.json(outcome, 429);
    return c.json(outcome);
  });

  app.post("/generate/stream", async (c) => {
    const chatId = c.get("chatId");
    const body = await readJsonBody<{ prompt: string }>(c.req.raw);
    if (!body.prompt || body.prompt.trim().length === 0) {
      return c.json({ error: "prompt is required" }, 400);
    }
    const prompt = body.prompt.trim();
    return streamSSE(c, async (stream) => {
      const outcome = await startGeneration(db, chatId, prompt, (e) => {
        stream.writeSSE({ data: JSON.stringify({ type: "agent_event", event: e }) }).catch(() => {});
      });
      if (outcome.status === "clarify") {
        rememberClarify(db, chatId, prompt, outcome);
        await stream.writeSSE({
          data: JSON.stringify({ type: "outcome", outcome: { status: "clarify", question: outcome.question, options: outcome.options } }),
        });
        return;
      }
      clearSession(db, chatId);
      await stream.writeSSE({ data: JSON.stringify({ type: "outcome", outcome }) });
    }, sseErrorOutcome);
  });

  app.post("/generate/resume", async (c) => {
    const chatId = c.get("chatId");
    const body = await readJsonBody<{ answer: string }>(c.req.raw);
    const pending = getPendingClarify(db, chatId);
    if (!pending) return c.json({ error: "no pending clarification for this chat" }, 400);
    if (!body.answer || body.answer.trim().length === 0) {
      return c.json({ error: "answer is required" }, 400);
    }
    const outcome = await resumeGeneration(db, chatId, pending.originalPrompt, pending.messages, body.answer.trim(), pending.round);
    if (outcome.status === "clarify") {
      rememberClarify(db, chatId, pending.originalPrompt, outcome);
      return c.json({ status: "clarify", question: outcome.question, options: outcome.options });
    }
    // Keep the pending clarification on error/needs_purchase/rate_limited so the
    // user can re-answer instead of being stranded with no session to resume.
    if (outcome.status === "ok") clearSession(db, chatId);
    return c.json(outcome);
  });

  app.post("/generate/resume/stream", async (c) => {
    const chatId = c.get("chatId");
    const body = await readJsonBody<{ answer: string }>(c.req.raw);
    const pending = getPendingClarify(db, chatId);
    if (!pending) return c.json({ error: "no pending clarification for this chat" }, 400);
    if (!body.answer || body.answer.trim().length === 0) {
      return c.json({ error: "answer is required" }, 400);
    }
    const answer = body.answer.trim();
    return streamSSE(c, async (stream) => {
      const outcome = await resumeGeneration(db, chatId, pending.originalPrompt, pending.messages, answer, pending.round, (e) => {
        stream.writeSSE({ data: JSON.stringify({ type: "agent_event", event: e }) }).catch(() => {});
      });
      if (outcome.status === "clarify") {
        rememberClarify(db, chatId, pending.originalPrompt, outcome);
        await stream.writeSSE({
          data: JSON.stringify({ type: "outcome", outcome: { status: "clarify", question: outcome.question, options: outcome.options } }),
        });
        return;
      }
      // Keep the pending clarification on error/needs_purchase/rate_limited so
      // the user can re-answer instead of being stranded with no session.
      if (outcome.status === "ok") clearSession(db, chatId);
      await stream.writeSSE({ data: JSON.stringify({ type: "outcome", outcome }) });
    }, sseErrorOutcome);
  });

  app.post("/generate/extend", async (c) => {
    const chatId = c.get("chatId");
    const body = await readJsonBody<{ generationId: number; prompt: string }>(c.req.raw);
    if (!body.generationId || typeof body.generationId !== "number") {
      return c.json({ error: "generationId is required" }, 400);
    }
    if (!body.prompt || body.prompt.trim().length === 0) {
      return c.json({ error: "prompt is required" }, 400);
    }
    const prompt = body.prompt.trim();
    const outcome = await extendGeneration(db, chatId, body.generationId, prompt);
    if (outcome.status === "clarify") {
      rememberClarify(db, chatId, prompt, outcome);
      return c.json({ status: "clarify", question: outcome.question, options: outcome.options });
    }
    // Only clear the session after a successful extend; keep any pending
    // clarification from another flow intact on error/needs_purchase/rate_limited.
    if (outcome.status === "ok") clearSession(db, chatId);
    if (outcome.status === "rate_limited") return c.json(outcome, 429);
    return c.json(outcome);
  });

  app.post("/generate/extend/stream", async (c) => {
    const chatId = c.get("chatId");
    const body = await readJsonBody<{ generationId: number; prompt: string }>(c.req.raw);
    if (!body.generationId || typeof body.generationId !== "number") {
      return c.json({ error: "generationId is required" }, 400);
    }
    if (!body.prompt || body.prompt.trim().length === 0) {
      return c.json({ error: "prompt is required" }, 400);
    }
    const generationId = body.generationId;
    const prompt = body.prompt.trim();
    return streamSSE(c, async (stream) => {
      const outcome = await extendGeneration(db, chatId, generationId, prompt, (e) => {
        stream.writeSSE({ data: JSON.stringify({ type: "agent_event", event: e }) }).catch(() => {});
      });
      if (outcome.status === "clarify") {
        rememberClarify(db, chatId, prompt, outcome);
        await stream.writeSSE({
          data: JSON.stringify({ type: "outcome", outcome: { status: "clarify", question: outcome.question, options: outcome.options } }),
        });
        return;
      }
      // Only clear the session after a successful extend; keep any pending
      // clarification from another flow intact on error/needs_purchase/rate_limited.
      if (outcome.status === "ok") clearSession(db, chatId);
      await stream.writeSSE({ data: JSON.stringify({ type: "outcome", outcome }) });
    }, sseErrorOutcome);
  });

  return app;
}
