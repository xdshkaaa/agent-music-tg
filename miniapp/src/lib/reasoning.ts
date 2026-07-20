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

/**
 * Human-readable Russian label for a tool call, used in "simple" mode so
 * regular users see what the agent is doing instead of raw camelCase/
 * snake_case tool identifiers (searchTrack, add_to_playlist, ...).
 */
const FRIENDLY_TOOL_LABELS: Record<string, string> = {
  searchTrack: "Ищу трек",
  searchTracks: "Ищу треки",
  searchArtist: "Ищу артиста",
  getArtistTopTracks: "Смотрю топ треков артиста",
  add_to_playlist: "Добавляю треки",
  finalize_playlist: "Собираю плейлист",
  clarify: "Уточняю детали",
};

export function friendlyToolLabel(name: string): string {
  return FRIENDLY_TOOL_LABELS[name] ?? name;
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

/** One item from a list result, reduced to its most human-readable field. */
function itemSummary(item: unknown): string {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") {
    const r = item as Record<string, unknown>;
    if (typeof r.title === "string") return typeof r.artist === "string" ? `${r.artist} – ${r.title}` : r.title;
    if (typeof r.uri === "string") return r.uri;
  }
  return String(item);
}

/** Compact one-line result: string as-is, title/uri/error picked out, array as count + preview, else JSON. */
export function resultSummary(result: unknown): string {
  let s: string;
  if (typeof result === "string") {
    s = result;
  } else if (Array.isArray(result)) {
    if (result.length === 0) s = "пусто";
    else {
      const preview = itemSummary(result[0]);
      s = result.length === 1 ? preview : `${preview} + ещё ${result.length - 1}`;
    }
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

export type TranscriptLineState = "thinking" | "pending" | "success" | "error";

export interface TranscriptLine {
  key: string;
  segments: LineSegment[];
  marker: string;
  depth: 0 | 1;
  state: TranscriptLineState;
}

/** Cap rendered transcript lines so a multi-KB thinking stream can't blow up layout. */
export const MAX_LINES = 200;

/**
 * Flatten ordered events into renderable lines. Each tool result is paired
 * with its call by id and rendered inline on the call's line.
 */
export function toLines(events: AgentEvent[], opts?: { friendly?: boolean }): TranscriptLine[] {
  const friendly = opts?.friendly ?? false;
  const label = (name: string) => (friendly ? friendlyToolLabel(name) : name);
  const results = new Map<string, Extract<AgentEvent, { kind: "tool_result" }>>();
  for (const e of events) if (e.kind === "tool_result") results.set(e.id, e);

  const lines: TranscriptLine[] = [];
  const paired = new Set<string>();

  const callLine = (e: Extract<AgentEvent, { kind: "tool_call" }>, i: number) => {
    const segments: LineSegment[] = [
      { text: label(e.name), tone: "call" },
      { text: `(${argSummary(e.args)})`, tone: "args" },
    ];
    const r = results.get(e.id);
    if (r) {
      paired.add(e.id);
      segments.push({ text: ` ${r.ok ? "✓" : "✗"} ${resultSummary(r.result)}`, tone: r.ok ? "ok" : "error" });
    }
    lines.push({
      key: `c${i}`,
      segments,
      marker: "⏺",
      depth: 0,
      state: r ? (r.ok ? "success" : "error") : "pending",
    });
  };

  const orphanLine = (e: Extract<AgentEvent, { kind: "tool_result" }>, i: number) => {
    lines.push({
      key: `t${i}`,
      segments: [{ text: `${e.ok ? "✓" : "✗"} ${resultSummary(e.result)}`, tone: e.ok ? "ok" : "error" }],
      marker: "⎿",
      depth: 1,
      state: e.ok ? "success" : "error",
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
        .forEach((l, j) =>
          lines.push({
            key: `r${i}-${j}`,
            segments: [{ text: l, tone: "reasoning" }],
            marker: "·",
            depth: 0,
            state: "thinking",
          }),
        );
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
          { text: label(e.name), tone: "call" },
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
        lines.push({
          key: `g${run[1]}`,
          segments,
          marker: "⏺",
          depth: 0,
          state: done < rest.length ? "pending" : err > 0 ? "error" : "success",
        });

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
