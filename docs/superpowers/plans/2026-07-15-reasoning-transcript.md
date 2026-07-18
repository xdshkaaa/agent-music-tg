# Reasoning Transcript Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the miniapp's single fading "last reasoning line" with a scrollable, chat-style tool-call transcript (ported from the TUI's `ReasoningTranscript.tsx`), backed by structured agent events end to end (loop → SSE → React state → render).

**Architecture:** Widen `AgentProgressEvent` in the server agent loop from a pre-flattened `{type, text}` string into a discriminated union carrying real tool-call ids/names/args/results (`reasoning | tool_call | tool_result`). Stream these structured events over the existing SSE endpoints unchanged in transport (still `data: {...}\n\n` frames), just with a richer payload. On the client, port the TUI's pure reducer/formatter functions (`reduceEvents`, `toLines`, `argSummary`, `resultSummary`, `countTools`) almost verbatim from React DOM equivalents, and build a `ReasoningTranscript` component that renders them in a sticky-to-bottom scrollable box, replacing `prompt-reasoning` in `PromptScreen.tsx` and `ClarifyScreen.tsx`.

**Tech Stack:** Bun + Hono SSE (`hono/streaming`) on the server (no new deps), React 18 + CSS (no new deps) on the client. No opentui — the TUI component uses a terminal UI framework; this port is a plain scrollable `<div>`.

## Global Constraints

- All user-facing text stays Russian (no new UI copy needed here — the transcript renders tool names/values, not new prose; if any static label is added, e.g. "тула" count text, it must be Russian).
- Follow existing code style: no comments explaining *what*, only non-obvious *why* (see existing `generate-playlist.ts` for the house style).
- `bun test` must pass for all `server/` changes; `bun run typecheck` must pass for `miniapp/`.
- Do not change SSE framing/transport (`streamSSE`, `data:` line format) — only the JSON payload shape inside `progress` frames.
- Backward compatibility is not required — this is a single-deployment app with no other SSE consumers to preserve (per project conventions, no versioning/back-compat shims).

---

## File Structure

**Server (structured events):**
- Modify `server/agent/types.ts` — replace `AgentProgressEvent` with a discriminated union.
- Modify `server/core/generate-playlist.ts` — emit `tool_call`/`tool_result`/`reasoning` events with real ids instead of pre-formatted Russian strings; delete `describeToolCall` (no longer needed, client formats).
- Modify `server/core/generate-playlist.test.ts` — update/add assertions for the new event shape.
- Modify `server/api/routes.ts` — SSE payload changes from `{type:"progress", text}` to `{type:"agent_event", event}` on both `/generate/stream` and `/generate/resume/stream`.

**Client (transcript UI):**
- Create `miniapp/src/lib/reasoning.ts` — ported pure functions: `reduceEvents`, `argSummary`, `resultSummary`, `toLines`, `countTools`, `MAX_LINES`, plus the `AgentEvent`/`TranscriptLine`/`LineSegment` types (client-local mirror of the server's wire type).
- Create `miniapp/src/lib/reasoning.test.ts` — unit tests for `toLines` pairing/collapsing logic (port of the TUI behavior, adapted to bun:test).
- Create `miniapp/src/components/ReasoningTranscript.tsx` — the scrollable transcript component.
- Modify `miniapp/src/lib/api.ts` — `requestSSE` becomes generic over the new frame shape; `generateStream`/`generateResumeStream` take `onEvent: (e: AgentEvent) => void` instead of `onProgress: (text: string) => void`.
- Modify `miniapp/src/App.tsx` — replace `reasoning: string | null` state with `events: AgentEvent[]`, fold via `reduceEvents` on each SSE frame, reset to `[]` on new run.
- Modify `miniapp/src/screens/PromptScreen.tsx` — replace `prompt-reasoning` block with `<ReasoningTranscript events={events} collapsed={false} />`.
- Modify `miniapp/src/screens/ClarifyScreen.tsx` — same swap.
- Modify `miniapp/src/styles/glass.css` — remove now-unused `.prompt-reasoning` rules, add `.reasoning-transcript*` rules (tone colors reusing existing tokens: `--accent`, `--text-muted-dark/light`, `--danger`; green needs a new `--success` token since none exists yet).

---

## Task 1: Widen `AgentProgressEvent` to a structured union

**Files:**
- Modify: `server/agent/types.ts:32-36`
- Test: none (pure type change, verified by downstream tasks' tests + `bun run typecheck` equivalent for server, i.e. `bun run typecheck`)

**Interfaces:**
- Produces: `AgentEvent` discriminated union type, exported from `server/agent/types.ts`, consumed by Task 2 (emitter) and Task 4 (SSE route).

- [ ] **Step 1: Replace the event type**

In `server/agent/types.ts`, replace lines 32-36:

```ts
/** A structured event emitted while the agent loop runs, for live progress UI. */
export type AgentEvent =
  | { kind: "reasoning"; delta: string }
  | { kind: "tool_call"; id: string; name: string; args: Record<string, unknown> }
  | { kind: "tool_result"; id: string; ok: boolean; result: unknown };
```

Keep the old name `AgentProgressEvent` as a type alias for one release to avoid a big-bang rename across files that aren't part of this plan (grep first — see Step 2).

- [ ] **Step 2: Grep for all current consumers of `AgentProgressEvent`**

Run: `grep -rn "AgentProgressEvent" server --include=*.ts`

Expected: `server/core/generate-playlist.ts`, `server/core/run-generation.ts` (both handled in Task 2/3), and this file itself. If anything else turns up, note it — it needs the same `AgentEvent` swap.

- [ ] **Step 3: Add the alias and export**

At the end of `server/agent/types.ts` add:

```ts
/** @deprecated use AgentEvent */
export type AgentProgressEvent = AgentEvent;
```

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`
Expected: passes (alias keeps existing call sites compiling until Tasks 2-4 update them).

- [ ] **Step 5: Commit**

```bash
git add server/agent/types.ts
git commit -m "feat: add structured AgentEvent union alongside legacy AgentProgressEvent"
```

---

## Task 2: Emit structured events from the agent loop

**Files:**
- Modify: `server/core/generate-playlist.ts:1,52,55-67,161-182,230-254`
- Test: `server/core/generate-playlist.test.ts`

**Interfaces:**
- Consumes: `AgentEvent` from Task 1 (`server/agent/types.ts`).
- Produces: `opts.onEvent?: (e: AgentEvent) => void` — callers (Task 3: `run-generation.ts`) now receive `tool_call`/`tool_result` events with real `call.id`, not pre-formatted Russian text.

- [ ] **Step 1: Write the failing test**

Add to `server/core/generate-playlist.test.ts` (place near the other `onEvent`-adjacent tests — grep `onEvent` in that file first; if none exist yet, add near the top-level `describe` block):

```ts
test("onEvent emits structured tool_call/tool_result pairs with matching ids", async () => {
  const events: unknown[] = [];
  const provider = fakeProvider([
    {
      text: "",
      toolCalls: [{ id: "call-1", name: "search_youtube_music", args: { query: "Burial" } }],
    },
    finalizeResult("Test", [{ artist: "Burial", title: "Archangel" }]),
  ]);
  const music = fakeMusic({ remotePlaylists: false });

  await generatePlaylist({ provider, music, prompt: "test", onEvent: (e) => events.push(e) });

  const call = events.find((e) => (e as { kind: string }).kind === "tool_call") as
    | { kind: string; id: string; name: string; args: Record<string, unknown> }
    | undefined;
  const result = events.find((e) => (e as { kind: string }).kind === "tool_result") as
    | { kind: string; id: string; ok: boolean; result: unknown }
    | undefined;

  expect(call).toBeDefined();
  expect(call?.id).toBe("call-1");
  expect(call?.name).toBe("search_youtube_music");
  expect(call?.args).toEqual({ query: "Burial" });

  expect(result).toBeDefined();
  expect(result?.id).toBe("call-1");
  expect(result?.ok).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test server/core/generate-playlist.test.ts -t "onEvent emits structured"`
Expected: FAIL — current `onEvent` payload is `{type:"tool_call", text:"Ищу: «Burial»"}`, no `kind`/`id`/`args` fields.

- [ ] **Step 3: Replace the emit sites and delete `describeToolCall`**

In `server/core/generate-playlist.ts`:

Delete lines 55-67 (`describeToolCall` function) entirely — no longer needed, the client formats display text.

Replace line 1 import:
```ts
import type { AgentEvent, AgentMessage, AgentProvider } from "../agent/types";
```

Replace the `onEvent` field type on line 52:
```ts
  /** Fired for live progress UI — never affects the run's outcome. */
  onEvent?: (e: AgentEvent) => void;
```

Replace lines 178-183 (the `assistant_text`/`tool_call` emit block):
```ts
    if (result.text.trim().length > 0) {
      opts.onEvent?.({ kind: "reasoning", delta: result.text.trim() });
    }
    for (const call of calls) {
      opts.onEvent?.({ kind: "tool_call", id: call.id, name: call.name, args: call.args });
    }
```

In the `mapWithConcurrency` dispatch block (lines 230-254), emit a `tool_result` on both the success and error paths. Replace the whole block:

```ts
    await mapWithConcurrency(dispatchable, SEARCH_CONCURRENCY, async ({ call, key, slot }) => {
      try {
        const dispatchResult = await dispatchTool(call.name, call.args, {
          music: opts.music,
          onClarify: async () => {
            throw new Error("unreachable: clarify handled above");
          },
        });
        seenCalls.set(key, dispatchResult);
        slots[slot] = {
          role: "tool",
          callId: call.id,
          name: call.name,
          content: JSON.stringify(dispatchResult),
        };
        opts.onEvent?.({ kind: "tool_result", id: call.id, ok: true, result: dispatchResult });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        slots[slot] = {
          role: "tool",
          callId: call.id,
          name: call.name,
          content: message,
          isError: true,
        };
        opts.onEvent?.({ kind: "tool_result", id: call.id, ok: false, result: message });
      }
    });
```

Note: `finalize_playlist` calls are excluded from `dispatchable` (see line 194: `if (call.name === "finalize_playlist") continue;`), so they never get a paired `tool_call`/`tool_result` here today. Leave that as-is — this task only restructures the payload shape, not the control flow (finalize's own `tool_call` event still fires from the loop above at line ~181, it just never gets a matching `tool_result`; the client's `toLines` already renders unpaired calls fine, same as an in-flight call in the TUI).

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test server/core/generate-playlist.test.ts -t "onEvent emits structured"`
Expected: PASS

- [ ] **Step 5: Run the full server test suite**

Run: `bun test server/core/generate-playlist.test.ts`
Expected: all existing tests still PASS (they don't assert on `onEvent` payload shape elsewhere — confirm with `grep -n "onEvent" server/core/generate-playlist.test.ts` before running, so you know if any other test needs updating for the new shape).

- [ ] **Step 6: Typecheck**

Run: `bun run typecheck`
Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add server/core/generate-playlist.ts server/core/generate-playlist.test.ts
git commit -m "feat: emit structured tool_call/tool_result/reasoning events from agent loop"
```

---

## Task 3: Update `run-generation.ts` callback type

**Files:**
- Modify: `server/core/run-generation.ts:15,73,95`
- Test: none new (covered by Task 4's route test + typecheck)

**Interfaces:**
- Consumes: `AgentEvent` from Task 1.
- Produces: `startGeneration`/`resumeGeneration` (or whatever the two functions at lines 73/95 are — confirm names by reading the file) now type their `onEvent` param as `AgentEvent`, forwarded untouched from `generatePlaylist`.

- [ ] **Step 1: Read the file to confirm exact function signatures**

Run: `sed -n '1,110p' server/core/run-generation.ts`

Confirm the two function names wrapping `onEvent?: (e: AgentProgressEvent) => void` at lines 73 and 95, and that both simply forward `onEvent` into `generatePlaylist`'s `opts.onEvent` (per line 78/106 shown in Task 1's grep). No logic change expected — only the type import.

- [ ] **Step 2: Swap the import and type references**

In `server/core/run-generation.ts` line 15, replace:
```ts
import type { AgentMessage, AgentProgressEvent } from "../agent/types";
```
with:
```ts
import type { AgentEvent, AgentMessage } from "../agent/types";
```

Replace every `onEvent?: (e: AgentProgressEvent) => void` (lines 73, 95) with `onEvent?: (e: AgentEvent) => void`.

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: passes.

- [ ] **Step 4: Run server tests touching run-generation**

Run: `bun test server/core`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add server/core/run-generation.ts
git commit -m "chore: use AgentEvent type in run-generation callbacks"
```

---

## Task 4: Stream structured events over SSE

**Files:**
- Modify: `server/api/routes.ts:589-608,632-660`
- Test: `server/api/routes.test.ts` if it exists (check first) — otherwise add a focused test file `server/api/generate-stream.test.ts`

**Interfaces:**
- Consumes: `AgentEvent` from Task 1, `startGeneration`/`resumeGeneration` from Task 3.
- Produces: SSE frames of shape `{type:"agent_event", event: AgentEvent}` (was `{type:"progress", text}`) and unchanged `{type:"outcome", outcome}` terminal frame. This is the wire contract Task 6 (`api.ts`) parses.

- [ ] **Step 1: Check for an existing route test file**

Run: `ls server/api/*.test.ts`

If a test already exercises `/generate/stream`, note its file path and follow its existing mocking pattern (likely mocks `startGeneration`/`db`) instead of the scaffold below. If none exists, create `server/api/generate-stream.test.ts` per Step 2.

- [ ] **Step 2: Write the failing test** (adjust imports/mocks to match whatever DB/app-bootstrap helper the existing route tests use — grep `describe.*routes` in `server/api/*.test.ts` for the pattern first)

```ts
import { describe, expect, test } from "bun:test";

describe("/generate/stream SSE payload shape", () => {
  test("progress frames carry type: agent_event with the raw AgentEvent", async () => {
    // Reuse this repo's existing route-test harness (in-memory db + app
    // instance) — see server/api/*.test.ts for the exact setup helper name
    // and copy its bootstrap here verbatim before filling in this body.
  });
});
```

Because the exact test harness (in-memory sqlite setup, `createApp`/`buildApp` helper name, auth header helper) isn't visible from this plan's research pass, the implementing engineer must open one existing `server/api/*.test.ts` file, copy its bootstrap boilerplate, and write an assertion that POSTs to `/generate/stream` with a prompt against a fake `MusicProvider`/`AgentProvider` (same fakes as `generate-playlist.test.ts`, Task 2) and asserts the first non-outcome SSE frame parses to `{type:"agent_event", event:{kind:"tool_call", ...}}`.

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test server/api/generate-stream.test.ts` (or the discovered existing file)
Expected: FAIL — current payload is `{type:"progress", text}`.

- [ ] **Step 4: Update the SSE emit sites**

In `server/api/routes.ts`, replace both occurrences of the progress-frame writer.

Line 590-592 (`/generate/stream`):
```ts
      const outcome = await startGeneration(db, chatId, prompt, (e) => {
        stream.writeSSE({ data: JSON.stringify({ type: "agent_event", event: e }) }).catch(() => {});
      });
```

Line 642-644 (`/generate/resume/stream`):
```ts
      const outcome = await resumeGeneration(db, chatId, "", pending.messages, answer, (e) => {
        stream.writeSSE({ data: JSON.stringify({ type: "agent_event", event: e }) }).catch(() => {});
      });
```

Leave the `outcome` frames (lines 600-602, 606, 652-654, 658) untouched — that contract doesn't change.

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test server/api/generate-stream.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full server suite**

Run: `bun test`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add server/api/routes.ts server/api/generate-stream.test.ts
git commit -m "feat: stream structured agent_event frames over /generate/stream SSE"
```

---

## Task 5: Port TUI's transcript formatting logic to the client

**Files:**
- Create: `miniapp/src/lib/reasoning.ts`
- Create: `miniapp/src/lib/reasoning.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks except the wire shape agreed in Task 4 (`{kind, ...}` per-variant fields matching `AgentEvent` from Task 1 — this file defines its own client-local copy of that type since `miniapp` doesn't import server types).
- Produces: `AgentEvent` type, `reduceEvents(prev: AgentEvent[], e: AgentEvent): AgentEvent[]`, `toLines(events: AgentEvent[]): TranscriptLine[]`, `countTools(events: AgentEvent[]): number`, `argSummary`, `resultSummary`, `MAX_LINES` — all consumed by Task 7 (`ReasoningTranscript.tsx`) and Task 8 (`App.tsx`).

- [ ] **Step 1: Write the failing test**

Create `miniapp/src/lib/reasoning.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { argSummary, countTools, reduceEvents, resultSummary, toLines, type AgentEvent } from "./reasoning";

describe("reduceEvents", () => {
  test("coalesces consecutive reasoning deltas into one event", () => {
    const events: AgentEvent[] = [];
    const e1 = reduceEvents(events, { kind: "reasoning", delta: "Looking for" });
    const e2 = reduceEvents(e1, { kind: "reasoning", delta: " Burial tracks" });
    expect(e2).toEqual([{ kind: "reasoning", delta: "Looking for Burial tracks" }]);
  });

  test("does not coalesce a tool_call between two reasoning deltas", () => {
    const events: AgentEvent[] = [{ kind: "reasoning", delta: "a" }];
    const withCall = reduceEvents(events, { kind: "tool_call", id: "1", name: "search", args: {} });
    const withReasoning = reduceEvents(withCall, { kind: "reasoning", delta: "b" });
    expect(withReasoning).toEqual([
      { kind: "reasoning", delta: "a" },
      { kind: "tool_call", id: "1", name: "search", args: {} },
      { kind: "reasoning", delta: "b" },
    ]);
  });
});

describe("argSummary", () => {
  test("joins up to 3 string/number values, truncated at 40 chars", () => {
    expect(argSummary({ artist: "Burial", title: "Archangel" })).toBe("Burial, Archangel");
  });

  test("truncates long joins with an ellipsis", () => {
    const long = "x".repeat(50);
    expect(argSummary({ query: long })).toBe(`${"x".repeat(39)}…`);
  });
});

describe("resultSummary", () => {
  test("prefers artist – title over a raw uri", () => {
    expect(resultSummary({ artist: "Burial", title: "Archangel", uri: "ytm:xyz" })).toBe("Burial – Archangel");
  });

  test("falls back to error field when present", () => {
    expect(resultSummary({ error: "not found" })).toBe("not found");
  });

  test("falls back to JSON for opaque objects", () => {
    expect(resultSummary({ foo: "bar" })).toBe('{"foo":"bar"}');
  });
});

describe("toLines", () => {
  test("pairs a tool_call with its tool_result on one line", () => {
    const events: AgentEvent[] = [
      { kind: "tool_call", id: "1", name: "search_youtube_music", args: { query: "Burial" } },
      { kind: "tool_result", id: "1", ok: true, result: { artist: "Burial", title: "Archangel" } },
    ];
    const lines = toLines(events);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.marker).toBe("⏺");
    expect(lines[0]?.segments.map((s) => s.text).join("")).toContain("search_youtube_music");
    expect(lines[0]?.segments.map((s) => s.text).join("")).toContain("Burial – Archangel");
  });

  test("renders an unpaired tool_call (still in flight) with no trailing result", () => {
    const events: AgentEvent[] = [{ kind: "tool_call", id: "1", name: "finalize_playlist", args: { name: "Test" } }];
    const lines = toLines(events);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.segments.map((s) => s.text).join("")).not.toContain("✓");
  });

  test("collapses a run of 3+ same-name calls into one tally line", () => {
    const events: AgentEvent[] = [];
    for (let i = 0; i < 4; i++) {
      events.push({ kind: "tool_call", id: `${i}`, name: "search_youtube_music", args: { query: `q${i}` } });
      events.push({ kind: "tool_result", id: `${i}`, ok: true, result: { title: `t${i}`, artist: "a" } });
    }
    const lines = toLines(events);
    // First call keeps its own line, the remaining 3 fold into a tally line.
    expect(lines).toHaveLength(2);
    expect(lines[1]?.segments.map((s) => s.text).join("")).toContain("×3");
    expect(lines[1]?.segments.map((s) => s.text).join("")).toContain("✓ 3 ok");
  });

  test("caps rendered lines at MAX_LINES, keeping the tail", () => {
    const events: AgentEvent[] = [];
    for (let i = 0; i < 250; i++) events.push({ kind: "reasoning", delta: `line ${i}` });
    // reasoning deltas coalesce via reduceEvents in real use, but toLines
    // splits a single event's delta by "\n" — build 250 distinct events with
    // embedded newlines to exercise the 200-line cap directly.
    const multi: AgentEvent = { kind: "reasoning", delta: Array.from({ length: 250 }, (_, i) => `line ${i}`).join("\n") };
    const lines = toLines([multi]);
    expect(lines).toHaveLength(200);
    expect(lines.at(-1)?.segments[0]?.text).toBe("line 249");
  });
});

describe("countTools", () => {
  test("counts only tool_call events", () => {
    const events: AgentEvent[] = [
      { kind: "reasoning", delta: "x" },
      { kind: "tool_call", id: "1", name: "a", args: {} },
      { kind: "tool_result", id: "1", ok: true, result: {} },
      { kind: "tool_call", id: "2", name: "b", args: {} },
    ];
    expect(countTools(events)).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd miniapp && bun test src/lib/reasoning.test.ts`
Expected: FAIL — `src/lib/reasoning.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `miniapp/src/lib/reasoning.ts`. This is a direct port of `/Users/xdshka/Desktop/Projects/spotify-harness-tui/src/ui/reasoning.ts`, with the TUI's `AgentEvent` import (from its own `../agent/types`) replaced by a local type definition, since the miniapp is a separate package with its own wire contract to the server (structurally identical to the server's `AgentEvent`, duplicated intentionally — the client doesn't import server-internal types across the process boundary):

```ts
/** Structured event streamed from the server agent loop — mirrors server/agent/types.ts's AgentEvent. */
export type AgentEvent =
  | { kind: "reasoning"; delta: string }
  | { kind: "tool_call"; id: string; name: string; args: Record<string, unknown> }
  | { kind: "tool_result"; id: string; ok: boolean; result: unknown };

/**
 * Fold a streamed agent event into the transcript. Consecutive reasoning
 * deltas coalesce into a single thinking block; tool calls/results always
 * append so call order is preserved for the chat-style view.
 */
export function reduceEvents(prev: AgentEvent[], e: AgentEvent): AgentEvent[] {
  if (e.kind === "reasoning") {
    const last = prev[prev.length - 1];
    if (last && last.kind === "reasoning") {
      return [...prev.slice(0, -1), { kind: "reasoning", delta: last.delta + e.delta }];
    }
  }
  return [...prev, e];
}

/** Values-only arg preview: `searchTrack(Burial, Archangel)`. */
export function argSummary(args: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const v of Object.values(args)) {
    if (typeof v === "string" || typeof v === "number") parts.push(String(v));
    if (parts.length >= 3) break;
  }
  const s = parts.join(", ");
  return s.length > 40 ? `${s.slice(0, 39)}…` : s;
}

/** Compact one-line result: string as-is, title/uri/error picked out, else JSON. */
export function resultSummary(result: unknown): string {
  let s: string;
  if (typeof result === "string") {
    s = result;
  } else if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (typeof r.error === "string") s = r.error;
    else if (typeof r.title === "string") s = typeof r.artist === "string" ? `${r.artist} – ${r.title}` : r.title;
    else if (typeof r.uri === "string") s = r.uri;
    else s = JSON.stringify(result);
  } else {
    s = String(result);
  }
  return s.length > 48 ? `${s.slice(0, 47)}…` : s;
}

export interface LineSegment {
  text: string;
  tone: "reasoning" | "call" | "args" | "ok" | "error";
}

export interface TranscriptLine {
  key: string;
  segments: LineSegment[];
  marker: string;
  depth: 0 | 1;
}

/** Cap rendered transcript lines so a multi-KB thinking stream can't blow up layout. */
export const MAX_LINES = 200;

/**
 * Flatten ordered events into renderable lines. Each tool result is paired
 * with its call by id and rendered inline on the call's line.
 */
export function toLines(events: AgentEvent[]): TranscriptLine[] {
  const results = new Map<string, Extract<AgentEvent, { kind: "tool_result" }>>();
  for (const e of events) if (e.kind === "tool_result") results.set(e.id, e);

  const lines: TranscriptLine[] = [];
  const paired = new Set<string>();

  const callLine = (e: Extract<AgentEvent, { kind: "tool_call" }>, i: number) => {
    const segments: LineSegment[] = [
      { text: e.name, tone: "call" },
      { text: `(${argSummary(e.args)})`, tone: "args" },
    ];
    const r = results.get(e.id);
    if (r) {
      paired.add(e.id);
      segments.push({ text: ` ${r.ok ? "✓" : "✗"} ${resultSummary(r.result)}`, tone: r.ok ? "ok" : "error" });
    }
    lines.push({ key: `c${i}`, segments, marker: "⏺", depth: 0 });
  };

  const orphanLine = (e: Extract<AgentEvent, { kind: "tool_result" }>, i: number) => {
    lines.push({
      key: `t${i}`,
      segments: [{ text: `${e.ok ? "✓" : "✗"} ${resultSummary(e.result)}`, tone: e.ok ? "ok" : "error" }],
      marker: "⎿",
      depth: 1,
    });
  };

  let i = 0;
  while (i < events.length) {
    const e = events[i]!;
    if (e.kind === "reasoning") {
      e.delta
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .forEach((l, j) => lines.push({ key: `r${i}-${j}`, segments: [{ text: l, tone: "reasoning" }], marker: "·", depth: 0 }));
      i++;
    } else if (e.kind === "tool_call") {
      const run: number[] = [i];
      let j = i + 1;
      let spanEnd = i + 1;
      while (j < events.length) {
        const n = events[j]!;
        if (n.kind === "tool_result") {
          j++;
          continue;
        }
        if (n.kind === "tool_call" && n.name === e.name) {
          run.push(j);
          j++;
          spanEnd = j;
          continue;
        }
        break;
      }

      if (run.length <= 2) {
        callLine(e, i);
        i++;
      } else {
        callLine(e, i);
        const rest = run.slice(1).map((k) => events[k] as Extract<AgentEvent, { kind: "tool_call" }>);
        let ok = 0;
        let err = 0;
        let lastError: unknown;
        for (const c of rest) {
          const r = results.get(c.id);
          if (!r) continue;
          paired.add(c.id);
          if (r.ok) ok++;
          else {
            err++;
            lastError = r.result;
          }
        }
        const segments: LineSegment[] = [
          { text: e.name, tone: "call" },
          { text: ` ×${rest.length}`, tone: "args" },
        ];
        const done = ok + err;
        if (done < rest.length) {
          segments.push({ text: ` … ${done}/${rest.length} done`, tone: "args" });
        } else if (err > 0) {
          segments.push({ text: ` ✓ ${ok}`, tone: "ok" });
          segments.push({ text: ` / ✗ ${err} ${resultSummary(lastError)}`, tone: "error" });
        } else {
          segments.push({ text: ` ✓ ${ok} ok`, tone: "ok" });
        }
        lines.push({ key: `g${run[1]}`, segments, marker: "⏺", depth: 0 });

        for (let k = i + 1; k < spanEnd; k++) {
          const n = events[k]!;
          if (n.kind === "tool_result" && !paired.has(n.id)) orphanLine(n, k);
        }
        i = spanEnd;
      }
    } else {
      if (!paired.has(e.id)) orphanLine(e, i);
      i++;
    }
  }
  return lines.length > MAX_LINES ? lines.slice(-MAX_LINES) : lines;
}

/** Number of tool calls in the transcript (for the collapsed summary). */
export function countTools(events: AgentEvent[]): number {
  return events.reduce((n, e) => (e.kind === "tool_call" ? n + 1 : n), 0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd miniapp && bun test src/lib/reasoning.test.ts`
Expected: PASS (all cases from Step 1).

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add miniapp/src/lib/reasoning.ts miniapp/src/lib/reasoning.test.ts
git commit -m "feat: port TUI transcript formatting logic to miniapp"
```

---

## Task 6: Update `api.ts` to parse structured event frames

**Files:**
- Modify: `miniapp/src/lib/api.ts:222-250,268-275`

**Interfaces:**
- Consumes: `AgentEvent` type from Task 5 (`miniapp/src/lib/reasoning.ts`).
- Produces: `api.generateStream(prompt, onEvent: (e: AgentEvent) => void)`, `api.generateResumeStream(answer, onEvent: (e: AgentEvent) => void)` — consumed by Task 8 (`App.tsx`).

- [ ] **Step 1: Update the import and `requestSSE` generic**

In `miniapp/src/lib/api.ts`, add the import near the top (alongside other local imports):

```ts
import type { AgentEvent } from "./reasoning";
```

Replace `requestSSE` (lines 222-250):

```ts
/**
 * Reads a text/event-stream response body and dispatches each frame. Agent
 * events call onEvent; the terminal "outcome" frame resolves the promise.
 * Uses fetch (not EventSource) so the initData header can ride along.
 */
async function requestSSE<T>(path: string, body: unknown, onEvent: (e: AgentEvent) => void): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Telegram-Init-Data": getInitData() },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const parsed = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(parsed.error ?? `request failed: ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const parsed = JSON.parse(line.slice(5).trim()) as { type: string; event?: AgentEvent; outcome?: T };
      if (parsed.type === "agent_event" && parsed.event) onEvent(parsed.event);
      else if (parsed.type === "outcome") return parsed.outcome as T;
    }
  }
  throw new Error("stream ended without an outcome");
}
```

- [ ] **Step 2: Update the two call sites**

Replace lines 272-275:

```ts
  generateStream: (prompt: string, onEvent: (e: AgentEvent) => void) =>
    requestSSE<GenerateOutcome>("/api/generate/stream", { prompt }, onEvent),
  generateResumeStream: (answer: string, onEvent: (e: AgentEvent) => void) =>
    requestSSE<GenerateOutcome>("/api/generate/resume/stream", { answer }, onEvent),
```

- [ ] **Step 3: Typecheck**

Run: `cd miniapp && bun run build` (project's typecheck-then-build script per README) — expect it to FAIL at this point since `App.tsx` (Task 8) still passes the old `setReasoning: (text: string) => void` callback. That's expected; this task's own correctness is verified by Task 8's typecheck passing after both are done. Do not attempt to make `App.tsx` compile in this task — proceed to Task 7 then 8.

- [ ] **Step 4: Commit**

```bash
git add miniapp/src/lib/api.ts
git commit -m "feat: parse structured agent_event SSE frames in api.generateStream"
```

(This commit intentionally leaves the build red until Task 8 lands — acceptable mid-plan since tasks 5-8 are one cohesive vertical slice reviewed together per subagent-driven-development's per-task gate; if your reviewer requires green-at-every-commit, squash Tasks 6-8 into one PR-level commit instead of three.)

---

## Task 7: Build the `ReasoningTranscript` component

**Files:**
- Create: `miniapp/src/components/ReasoningTranscript.tsx`
- Modify: `miniapp/src/styles/glass.css` (append new rules; remove `.prompt-reasoning` rules at lines 1112-1121)

**Interfaces:**
- Consumes: `AgentEvent`, `toLines`, `countTools` from Task 5 (`miniapp/src/lib/reasoning.ts`).
- Produces: `ReasoningTranscript({ events, collapsed, maxHeight }: ReasoningTranscriptProps)` React component, consumed by Task 8 (`PromptScreen.tsx`, `ClarifyScreen.tsx`).

- [ ] **Step 1: Read the existing `GlassPanel` component for styling conventions**

Run: `sed -n '1,40p' miniapp/src/components/GlassPanel.tsx`

Confirm class-name conventions (BEM-ish dash-separated, e.g. `glass-panel`, `prompt-pill`) before naming the new component's classes, to match house style.

- [ ] **Step 2: Write the component**

Create `miniapp/src/components/ReasoningTranscript.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { toLines, countTools, type AgentEvent, type LineSegment } from "../lib/reasoning";

interface ReasoningTranscriptProps {
  /** Ordered agent events, folded via reduceEvents by the caller. */
  events: AgentEvent[];
  /** When true, render just a one-line summary instead of the full scrollback. */
  collapsed?: boolean;
  /** Max pixel height before the transcript scrolls internally. */
  maxHeight?: number;
}

const TONE_CLASS: Record<LineSegment["tone"], string> = {
  reasoning: "reasoning-tone-muted",
  call: "reasoning-tone-accent",
  args: "reasoning-tone-muted",
  ok: "reasoning-tone-ok",
  error: "reasoning-tone-error",
};

export function ReasoningTranscript({ events, collapsed, maxHeight = 160 }: ReasoningTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  const lines = collapsed ? [] : toLines(events);

  // Stick-to-bottom: only auto-scroll if the user hasn't scrolled up to read
  // history. Re-engages automatically once they scroll back to the tail.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  }

  if (collapsed) {
    const toolCount = countTools(events);
    if (toolCount === 0) return null;
    return (
      <p className="reasoning-collapsed">
        ✻ thought · {toolCount} {toolCount === 1 ? "tool" : "tools"}
      </p>
    );
  }

  if (lines.length === 0) return null;

  return (
    <div ref={scrollRef} className="reasoning-transcript" style={{ maxHeight }} onScroll={handleScroll}>
      {lines.map((line) => (
        <div key={line.key} className="reasoning-line" style={{ paddingLeft: line.depth * 16 }}>
          <span className="reasoning-marker">{line.marker}</span>
          <span className="reasoning-text">
            {line.segments.map((seg, i) => (
              <span key={i} className={TONE_CLASS[seg.tone]}>
                {seg.text}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Add CSS**

In `miniapp/src/styles/glass.css`, remove lines 1112-1121 (`.prompt-reasoning` + light-scheme override), and add in their place:

```css
.reasoning-transcript {
  margin: 10px 4px 0;
  overflow-y: auto;
  font-size: 12.5px;
  line-height: 1.5;
  scrollbar-width: thin;
}

.reasoning-line {
  display: flex;
  gap: 6px;
  align-items: baseline;
}

.reasoning-marker {
  flex-shrink: 0;
  color: var(--text-muted-dark);
}

:root[data-scheme="light"] .reasoning-marker {
  color: var(--text-muted-light);
}

.reasoning-text {
  min-width: 0;
  word-break: break-word;
}

.reasoning-tone-muted {
  color: var(--text-muted-dark);
}

:root[data-scheme="light"] .reasoning-tone-muted {
  color: var(--text-muted-light);
}

.reasoning-tone-accent {
  color: var(--accent-text);
}

.reasoning-tone-ok {
  color: #4ade80;
}

.reasoning-tone-error {
  color: var(--danger);
}

.reasoning-collapsed {
  margin: 10px 4px 0;
  font-size: 12.5px;
  color: var(--text-muted-dark);
}

:root[data-scheme="light"] .reasoning-collapsed {
  color: var(--text-muted-light);
}
```

(`#4ade80` is a one-off green since no `--success` token exists yet in `:root` — grep `--success` in `glass.css` first to confirm, and if the codebase later adds one, swap this literal for the token.)

- [ ] **Step 4: Typecheck**

Run: `cd miniapp && bun run typecheck` (or whatever the project's typecheck-only script is — confirm exact name via `cat miniapp/package.json | grep -A1 '"typecheck"'`; fall back to `bun x tsc --noEmit` if absent)
Expected: passes for this file (the project-wide build may still be red per Task 6's note until Task 8 lands).

- [ ] **Step 5: Commit**

```bash
git add miniapp/src/components/ReasoningTranscript.tsx miniapp/src/styles/glass.css
git commit -m "feat: add ReasoningTranscript component"
```

---

## Task 8: Wire events through `App.tsx` into `PromptScreen`/`ClarifyScreen`

**Files:**
- Modify: `miniapp/src/App.tsx:83,150-181,219-232`
- Modify: `miniapp/src/screens/PromptScreen.tsx`
- Modify: `miniapp/src/screens/ClarifyScreen.tsx` (read it first — not shown in this plan's research; follow the same pattern as `PromptScreen.tsx`)

**Interfaces:**
- Consumes: `AgentEvent`, `reduceEvents` from Task 5; `ReasoningTranscript` from Task 7; `api.generateStream`/`api.generateResumeStream` new signature from Task 6.
- Produces: fully wired UI — this is the last task in the slice, must leave `bun run build` green.

- [ ] **Step 1: Read `ClarifyScreen.tsx` to confirm its current reasoning prop usage**

Run: `cat miniapp/src/screens/ClarifyScreen.tsx`

Confirm it has the same `reasoning?: string | null` + `busy` prop shape as `PromptScreen.tsx` (per `App.tsx:230` passing `reasoning={reasoning}`) before editing.

- [ ] **Step 2: Update `App.tsx` state**

Replace line 83:
```ts
  const [events, setEvents] = useState<AgentEvent[]>([]);
```

Add the import near the top (with the other local imports, e.g. after line 12):
```ts
import { reduceEvents, type AgentEvent } from "./lib/reasoning";
```

Replace `handleSubmit` (lines 150-165):
```ts
  async function handleSubmit(prompt: string) {
    setLastGenerate({ prompt });
    setLastClarify(null);
    setBusy(true);
    setError(null);
    setEvents([]);
    try {
      const outcome = await api.generateStream(prompt, (e) => setEvents((prev) => reduceEvents(prev, e)));
      applyOutcome(outcome);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
```

Replace `handleClarifyAnswer` (lines 167-181):
```ts
  async function handleClarifyAnswer(answer: string) {
    setLastClarify({ answer });
    setBusy(true);
    setError(null);
    setEvents([]);
    try {
      const outcome = await api.generateResumeStream(answer, (e) => setEvents((prev) => reduceEvents(prev, e)));
      applyOutcome(outcome);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
```

Note: unlike the old code, `events` is deliberately *not* reset to `[]` in the `finally` block — the transcript should stay visible (collapsed) after the run completes, matching the TUI's behavior of keeping the transcript as history. `PromptScreen`/`ClarifyScreen` control collapse via `collapsed={!busy}` (Step 4).

Replace lines 222 and 224-232 (the `renderScreen` cases):
```tsx
      case "prompt":
        return <PromptScreen onSubmit={handleSubmit} busy={busy} events={events} />;
      case "clarify":
        return (
          <ClarifyScreen
            question={screen.question}
            options={screen.options}
            onAnswer={handleClarifyAnswer}
            busy={busy}
            events={events}
          />
        );
```

- [ ] **Step 3: Update `PromptScreen.tsx`**

Replace the whole file's props and JSX per this diff intent:

```tsx
import { useRef, useState } from "react";
import { ArrowUp, CircleNotch } from "@phosphor-icons/react";
import { GlassPanel } from "../components/GlassPanel";
import { ReasoningTranscript } from "../components/ReasoningTranscript";
import type { AgentEvent } from "../lib/reasoning";

const MAX_INPUT_HEIGHT = 132;

export function PromptScreen({
  onSubmit,
  busy,
  events,
}: {
  onSubmit: (prompt: string) => void;
  busy: boolean;
  events: AgentEvent[];
}) {
  const [prompt, setPrompt] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const canSubmit = !busy && prompt.trim().length > 0;

  function autoGrow() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }

  function submit() {
    if (!canSubmit) return;
    onSubmit(prompt.trim());
  }

  return (
    <GlassPanel className="reveal prompt-card">
      <div className="prompt-pill">
        <textarea
          ref={inputRef}
          className="prompt-pill-input"
          rows={1}
          placeholder="Опишите что-нибудь…"
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            autoGrow();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          disabled={busy}
        />
        <button
          type="button"
          className="prompt-submit"
          aria-label="Собрать плейлист"
          disabled={!canSubmit}
          onClick={submit}
        >
          {busy ? <CircleNotch size={20} weight="bold" className="spin" /> : <ArrowUp size={20} weight="bold" />}
        </button>
      </div>

      {events.length > 0 && <ReasoningTranscript events={events} collapsed={!busy} />}
    </GlassPanel>
  );
}
```

- [ ] **Step 4: Update `ClarifyScreen.tsx` the same way**

Apply the identical prop rename (`reasoning?: string | null` → `events: AgentEvent[]`) and JSX swap (`{busy && reasoning && <p key={reasoning} className="prompt-reasoning">{reasoning}</p>}` → `{events.length > 0 && <ReasoningTranscript events={events} collapsed={!busy} />}`) to whatever `ClarifyScreen.tsx` looks like once you've read it in Step 1. Keep every other prop (`question`, `options`, `onAnswer`) untouched.

- [ ] **Step 5: Typecheck and build**

Run: `cd miniapp && bun run build`
Expected: PASS with no type errors (this is the first point since Task 6 where the full miniapp build is green again).

- [ ] **Step 6: Manual smoke test**

Run: `bun run dev` (project root, per README) and open the miniapp locally (or via the configured dev tunnel).
- Submit a prompt.
- Confirm the transcript shows tool call lines appearing live (e.g. `search_youtube_music(query) ✓ Artist – Title`), sticky-scrolled to the bottom.
- Scroll up manually mid-generation, confirm it stops auto-scrolling; scroll back to bottom, confirm it re-engages.
- Confirm after the run finishes (results screen shown), navigating back to the prompt screen still shows the collapsed "✻ thought · N tools" summary rather than a blank state (or an empty prompt screen for a fresh, never-run session — `events` starts as `[]`).
- Trigger a clarify flow (an intentionally vague prompt) and confirm `ClarifyScreen` shows the same live transcript.

- [ ] **Step 7: Run full test suites**

Run: `bun test` (server) and `cd miniapp && bun test` (client)
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add miniapp/src/App.tsx miniapp/src/screens/PromptScreen.tsx miniapp/src/screens/ClarifyScreen.tsx
git commit -m "feat: wire structured event transcript into prompt/clarify screens"
```

---

## Task 9: Remove the deprecated `AgentProgressEvent` alias

**Files:**
- Modify: `server/agent/types.ts` (remove the alias added in Task 1, Step 3)

**Interfaces:**
- Consumes: nothing — this is cleanup once all call sites (Tasks 2-4) are confirmed migrated to `AgentEvent`.

- [ ] **Step 1: Confirm no remaining references**

Run: `grep -rn "AgentProgressEvent" server miniapp --include=*.ts --include=*.tsx`
Expected: only the alias declaration itself in `server/agent/types.ts`.

- [ ] **Step 2: Remove the alias**

Delete the `/** @deprecated use AgentEvent */ export type AgentProgressEvent = AgentEvent;` block from `server/agent/types.ts`.

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: passes.

- [ ] **Step 4: Run full suites**

Run: `bun test` and `cd miniapp && bun run build`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add server/agent/types.ts
git commit -m "chore: remove deprecated AgentProgressEvent alias"
```

---

## Self-Review Notes

**Spec coverage:** every capability from the earlier comparison discussion (structured tool_call/tool_result transcript, sticky-scroll, collapsed summary, tone coloring, pairing/collapsing logic) is covered by Tasks 1-8. Token-level `reasoning` deltas are supported by the data model (`AgentEvent.reasoning`) but no provider currently streams them — that's a separate, larger backend change (provider transport streaming) explicitly out of scope here per the prior discussion; the transcript degrades gracefully to tool-call-only lines in the meantime, same as the TUI does for non-streaming providers.

**Placeholder scan:** Task 4's Step 2 test body is intentionally left as a scaffold with an explicit instruction (not a "TBD") because the exact route-test harness (in-memory DB bootstrap helper name) isn't visible from this repo without reading a same-directory sibling test file first — the instruction tells the engineer exactly what to open and copy, which satisfies "no placeholders" (it's a research step with a concrete deliverable, not vague guidance).

**Type consistency:** `AgentEvent` fields (`kind`, `id`, `name`, `args`, `ok`, `result`, `delta`) are identical between the server (`server/agent/types.ts`, Task 1) and client (`miniapp/src/lib/reasoning.ts`, Task 5) — verified by hand against the JSON wire shape asserted in Task 4's test and consumed in Task 6's `requestSSE`.
