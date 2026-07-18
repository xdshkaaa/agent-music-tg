import type { AgentEvent, AgentMessage, AgentProvider } from "../agent/types";
import { MUSIC_AGENT_TOOLS, dispatchTool } from "../agent/tools";
import { PLAYLIST_SYSTEM_PROMPT } from "../agent/prompts";
import type { MusicProvider, Track } from "../music/types";
import { mapWithConcurrency, withTimeout } from "./concurrency";

export const DEFAULT_MAX_ITERATIONS = 12;
const SEARCH_CONCURRENCY = 5;
const LLM_CALL_TIMEOUT_MS = 30_000;
const MAX_CONSECUTIVE_EMPTY_TURNS = 2;

const LLM_TIMEOUT_SENTINEL = Symbol("llm-timeout");

export class NoTracksResolvedError extends Error {
  constructor() {
    super("none of the finalized tracks could be resolved by the music backend");
  }
}

export class MaxIterationsExceededError extends Error {
  constructor(maxIterations: number) {
    super(`playlist generation exceeded ${maxIterations} iterations without finalizing`);
  }
}

export class ClarifyNeededError extends Error {
  constructor(
    public readonly question: string,
    public readonly options: string[],
    public readonly messages: AgentMessage[],
    public readonly round: number,
  ) {
    super(`clarification needed: ${question}`);
  }
}

export interface FinalizedPlaylist {
  name: string;
  tracks: Track[];
  /** Present only when the backend supports remote playlists and creation succeeded. */
  remotePlaylistUrl?: string;
}

export interface GeneratePlaylistOptions {
  provider: AgentProvider;
  music: MusicProvider;
  prompt: string;
  maxIterations?: number;
  /** Resumes a run that previously threw ClarifyNeededError, with the user's answer. */
  resumeMessages?: AgentMessage[];
  resumeClarifyAnswer?: string;
  /** How many clarify rounds already happened before this call (gate + prior agent asks). */
  resumeClarifyRound?: number;
  /** Fired for live progress UI — never affects the run's outcome. */
  onEvent?: (e: AgentEvent) => void;
  /** "create" builds a playlist from scratch; "extend" appends to an existing one. */
  mode?: "create" | "extend";
  /** Existing playlist tracks (artist/title) when mode === "extend". */
  baseTracks?: { artist: string; title: string }[];
  /** Existing playlist title when mode === "extend" (used if finalize omits a name). */
  baseName?: string;
  /** Override the system prompt (used to inject extend-mode context). */
  systemPrompt?: string;
  /** Capped "artist - title" list of tracks the user disliked; nudges the agent away from them. */
  dislikedTracks?: string[];
  /** Uris to hard-filter out of the finalized result even if the agent proposes them. */
  dislikedUris?: Set<string>;
}

export interface GeneratePlaylistResult {
  playlist: FinalizedPlaylist;
  /** Full message history — pass back as resumeMessages if a future feature needs multi-turn context. */
  messages: AgentMessage[];
}

function callKey(name: string, args: Record<string, unknown>): string {
  const sorted = Object.keys(args)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = args[k];
      return acc;
    }, {});
  return `${name}:${JSON.stringify(sorted)}`;
}

interface FinalizeArgs {
  name: string;
  tracks: { artist: string; title: string }[];
}

function parseFinalizeArgs(
  args: Record<string, unknown>,
  opts?: { allowEmptyName?: boolean; allowEmptyTracks?: boolean },
): FinalizeArgs {
  const name = typeof args.name === "string" ? args.name : "";
  const tracksRaw = Array.isArray(args.tracks) ? args.tracks : [];
  const tracks = tracksRaw
    .filter((t): t is { artist: string; title: string } => {
      const r = t as Record<string, unknown>;
      return typeof r === "object" && r !== null && typeof r.artist === "string" && typeof r.title === "string";
    })
    .map((t) => ({ artist: t.artist, title: t.title }));
  if ((!opts?.allowEmptyName && name.length === 0) || (!opts?.allowEmptyTracks && tracks.length === 0)) {
    throw new Error(`finalize_playlist requires a non-empty "name" and a non-empty "tracks" array`);
  }
  return { name, tracks };
}

/** Removes within-list duplicates (by artist|title), preserving first occurrence order. */
function dedupeTracks(list: { artist: string; title: string }[]): { artist: string; title: string }[] {
  const seen = new Set<string>();
  const out: { artist: string; title: string }[] = [];
  for (const t of list) {
    const k = trackKey(t);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(t);
    }
  }
  return out;
}

function parseAddArgs(args: Record<string, unknown>): { artist: string; title: string }[] {
  const tracksRaw = Array.isArray(args.tracks) ? args.tracks : [];
  return tracksRaw
    .filter((t): t is { artist: string; title: string } => {
      const r = t as Record<string, unknown>;
      return typeof r === "object" && r !== null && typeof r.artist === "string" && typeof r.title === "string";
    })
    .map((t) => ({ artist: t.artist, title: t.title }));
}

function trackKey(t: { artist: string; title: string }): string {
  return `${t.artist.toLowerCase().trim()}|${t.title.toLowerCase().trim()}`;
}

/** Returns only the tracks whose (artist,title) are not already present in `existing`. */
function dedupeAgainst(
  incoming: { artist: string; title: string }[],
  existing: { artist: string; title: string }[],
): { artist: string; title: string }[] {
  const seen = new Set(existing.map(trackKey));
  const out: { artist: string; title: string }[] = [];
  for (const t of incoming) {
    const k = trackKey(t);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(t);
    }
  }
  return out;
}

async function resolveAndFinalize(
  music: MusicProvider,
  args: FinalizeArgs,
  cache: Map<string, unknown>,
  opts?: { baseProvided?: boolean; dislikedUris?: Set<string> },
): Promise<FinalizedPlaylist> {
  const found = await mapWithConcurrency(args.tracks, SEARCH_CONCURRENCY, async (t) => {
    const key = callKey("searchTrack", { artist: t.artist, title: t.title });
    let track = cache.get(key) as Track | null | undefined;
    if (track === undefined) {
      track = await music.searchTrack(t.artist, t.title);
      cache.set(key, track);
    }
    return track;
  });
  const dislikedUris = opts?.dislikedUris;
  const resolved = found.filter((t): t is Track => t != null && !(dislikedUris?.has(t.uri) ?? false));
  // In extend mode the base playlist may already contribute tracks, so an empty
  // addition is acceptable as long as the final list is non-empty.
  if (resolved.length === 0 && !opts?.baseProvided) throw new NoTracksResolvedError();

  if (music.capabilities.remotePlaylists && music.createPlaylist && music.addTracksToPlaylist) {
    const playlist = await music.createPlaylist(args.name);
    if (resolved.length > 0) {
      await music.addTracksToPlaylist(playlist.id, resolved.map((t) => t.uri));
    }
    return { name: args.name, tracks: resolved, remotePlaylistUrl: playlist.url };
  }

  return { name: args.name, tracks: resolved };
}

/**
 * Drives the bounded agent tool loop: generate -> dispatch tools -> feed
 * results back -> repeat, until finalize_playlist is called or the iteration
 * cap is hit. Enforces: at most 3 clarify rounds per run (throws
 * ClarifyNeededError with the current round number; callers resume with
 * resumeMessages + resumeClarifyAnswer + resumeClarifyRound), a duplicate-call
 * cache so a repeated identical tool call is never re-dispatched, and
 * backend-dependent finalize (real playlist vs. resolved track list).
 */
export async function generatePlaylist(opts: GeneratePlaylistOptions): Promise<GeneratePlaylistResult> {
  const maxIterations = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const isExtend = opts.mode === "extend";
  const baseTracks = opts.baseTracks ?? [];
  const addedTracks: { artist: string; title: string }[] = [];
  let messages: AgentMessage[] = opts.resumeMessages ?? [{ role: "user", content: opts.prompt }];
  if (!opts.resumeMessages && opts.dislikedTracks && opts.dislikedTracks.length > 0) {
    messages.push({
      role: "user",
      content: `Не предлагай эти треки — пользователю они не нравятся: ${opts.dislikedTracks.join(", ")}`,
    });
  }
  let clarifyCount = opts.resumeClarifyRound ?? 0;
  const seenCalls = new Map<string, unknown>();
  let consecutiveEmptyTurns = 0;

  // Debug hook: force every AI search to error out on a post-clarify resume,
  // so the error path after the clarify step is always exercised.
  let forceSearchErrorAfterClarify = false;
  if (opts.resumeClarifyAnswer !== undefined) {
    messages = [...messages, { role: "user", content: opts.resumeClarifyAnswer }];
    forceSearchErrorAfterClarify = true;
  }

  for (let i = 0; i < maxIterations; i++) {
    const raced = await withTimeout(
      opts.provider.generateMessages(opts.systemPrompt ?? PLAYLIST_SYSTEM_PROMPT, messages, MUSIC_AGENT_TOOLS),
      LLM_CALL_TIMEOUT_MS,
      LLM_TIMEOUT_SENTINEL as unknown as Awaited<ReturnType<AgentProvider["generateMessages"]>>,
    );
    if ((raced as unknown) === LLM_TIMEOUT_SENTINEL) {
      throw new Error(`LLM call timed out after ${LLM_CALL_TIMEOUT_MS / 1000}s`);
    }
    const result = raced;
    const calls = result.toolCalls ?? [];

    if (calls.length === 0) {
      consecutiveEmptyTurns++;
      if (consecutiveEmptyTurns > MAX_CONSECUTIVE_EMPTY_TURNS) {
        throw new Error("agent turn produced no tool calls and no finalize_playlist");
      }
      messages.push({ role: "assistant", content: result.text, toolCalls: [] });
      messages.push({
        role: "user",
        content: "You must call at least one tool, or finalize_playlist if you have enough tracks.",
      });
      continue;
    }
    consecutiveEmptyTurns = 0;

    if (result.text.trim().length > 0) {
      opts.onEvent?.({ kind: "reasoning", delta: result.text.trim() });
    }
    for (const call of calls) {
      opts.onEvent?.({ kind: "tool_call", id: call.id, name: call.name, args: call.args });
    }

    const finalizeCall = calls.find((c) => c.name === "finalize_playlist") ?? null;
    const toolMessages: AgentMessage[] = [];
    const dispatchable: { call: (typeof calls)[number]; key: string; slot: number }[] = [];
    // Two-phase turn: classify calls first (clarify/finalize/duplicates are
    // synchronous decisions), then run the real dispatches concurrently while
    // keeping tool messages in the original call order via slot indices.
    const slots: (AgentMessage | null)[] = [];

    for (const call of calls) {
      if (call.name === "finalize_playlist") continue;

      if (call.name === "clarify") {
        if (clarifyCount >= 3) {
          toolMessages.push({
            role: "tool",
            callId: call.id,
            name: call.name,
            content: "clarify already used 3 times this run — finalize with your best judgment instead.",
            isError: true,
          });
          continue;
        }
        const question = String(call.args.question ?? "");
        const options = Array.isArray(call.args.options) ? call.args.options.map(String).slice(0, 3) : [];
        clarifyCount++;
        // Bubble up to the caller (bot/Mini App) to collect the user's answer;
        // caller resumes the run with resumeMessages + resumeClarifyAnswer + resumeClarifyRound.
        messages.push({ role: "assistant", content: result.text, toolCalls: calls });
        throw new ClarifyNeededError(question, options, messages, clarifyCount);
      }

      if (call.name === "add_to_playlist") {
        const incoming = parseAddArgs(call.args);
        const accepted = dedupeAgainst(incoming, [...baseTracks, ...addedTracks]);
        addedTracks.push(...accepted);
        const total = baseTracks.length + addedTracks.length;
        toolMessages.push({
          role: "tool",
          callId: call.id,
          name: call.name,
          content: `Added ${accepted.length} track(s). Playlist now has ${total} track(s).`,
        });
        continue;
      }

      const key = callKey(call.name, call.args);
      if (seenCalls.has(key)) {
        toolMessages.push({
          role: "tool",
          callId: call.id,
          name: call.name,
          content: `[duplicate call — reusing prior result] ${JSON.stringify(seenCalls.get(key))}`,
        });
        continue;
      }
      slots.push(null);
      dispatchable.push({ call, key, slot: slots.length - 1 });
    }

    if (forceSearchErrorAfterClarify && dispatchable.some((d) => d.call.name !== "clarify")) {
      throw new Error("forced search error after clarify (debug)");
    }

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
    for (const m of slots) {
      if (m) toolMessages.push(m);
    }

    if (finalizeCall) {
      try {
        const args = parseFinalizeArgs(
          finalizeCall.args,
          isExtend ? { allowEmptyName: true, allowEmptyTracks: true } : {},
        );
        const name = args.name || opts.baseName || "Playlist";
        const allTracks = isExtend
          ? dedupeTracks([...baseTracks, ...addedTracks, ...args.tracks])
          : args.tracks;
        const playlist = await resolveAndFinalize(
          opts.music,
          { name, tracks: allTracks },
          seenCalls,
          { baseProvided: isExtend && baseTracks.length > 0, dislikedUris: opts.dislikedUris },
        );
        return { playlist, messages };
      } catch (e) {
        // Backend resolved zero tracks — a retry with a different tracklist
        // won't help, so fail the run instead of feeding the error back.
        if (e instanceof NoTracksResolvedError) throw e;
        toolMessages.push({
          role: "tool",
          callId: finalizeCall.id,
          name: finalizeCall.name,
          content: `finalize_playlist rejected: ${e instanceof Error ? e.message : String(e)}`,
          isError: true,
        });
      }
    }

    messages.push({ role: "assistant", content: result.text, toolCalls: calls });
    messages.push(...toolMessages);
    if (i === maxIterations - 2) {
      messages.push({
        role: "user",
        content: "FINAL STEP: you must call finalize_playlist now with your best tracklist.",
      });
    } else {
      messages.push({ role: "user", content: "Continue. Call finalize_playlist once you have enough verified tracks." });
    }
  }

  // Ran out of iterations without an explicit finalize_playlist call — if the
  // agent accumulated tracks via add_to_playlist (or extend mode has a base
  // playlist), finalize with that best-effort list rather than failing the
  // run outright. Only a genuinely empty result surfaces MaxIterationsExceededError.
  const fallbackTracks = isExtend ? dedupeTracks([...baseTracks, ...addedTracks]) : dedupeTracks(addedTracks);
  if (fallbackTracks.length > 0) {
    try {
      const playlist = await resolveAndFinalize(
        opts.music,
        { name: opts.baseName || "Playlist", tracks: fallbackTracks },
        seenCalls,
        { baseProvided: isExtend && baseTracks.length > 0, dislikedUris: opts.dislikedUris },
      );
      return { playlist, messages };
    } catch (e) {
      if (!(e instanceof NoTracksResolvedError)) throw e;
    }
  }

  throw new MaxIterationsExceededError(maxIterations);
}
