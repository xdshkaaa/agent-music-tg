import type { AgentMessage, AgentProvider } from "../agent/types";
import { MUSIC_AGENT_TOOLS, dispatchTool } from "../agent/tools";
import { PLAYLIST_SYSTEM_PROMPT } from "../agent/prompts";
import type { MusicProvider, Track } from "../music/types";
import { mapWithConcurrency } from "./concurrency";

export const DEFAULT_MAX_ITERATIONS = 8;
const SEARCH_CONCURRENCY = 5;

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

function parseFinalizeArgs(args: Record<string, unknown>): FinalizeArgs {
  const name = typeof args.name === "string" ? args.name : "";
  const tracksRaw = Array.isArray(args.tracks) ? args.tracks : [];
  const tracks = tracksRaw
    .filter((t): t is { artist: string; title: string } => {
      const r = t as Record<string, unknown>;
      return typeof r === "object" && r !== null && typeof r.artist === "string" && typeof r.title === "string";
    })
    .map((t) => ({ artist: t.artist, title: t.title }));
  if (name.length === 0 || tracks.length === 0) {
    throw new Error(`finalize_playlist requires a non-empty "name" and a non-empty "tracks" array`);
  }
  return { name, tracks };
}

async function resolveAndFinalize(
  music: MusicProvider,
  args: FinalizeArgs,
  cache: Map<string, unknown>,
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
  const resolved = found.filter((t): t is Track => t != null);
  if (resolved.length === 0) throw new NoTracksResolvedError();

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
 * cap is hit. Enforces: at most one clarify per run (throws ClarifyNeededError
 * on the first ask, callers resume with resumeClarifyAnswer), a duplicate-call
 * cache so a repeated identical tool call is never re-dispatched, and
 * backend-dependent finalize (real playlist vs. resolved track list).
 */
export async function generatePlaylist(opts: GeneratePlaylistOptions): Promise<GeneratePlaylistResult> {
  const maxIterations = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  let messages: AgentMessage[] = opts.resumeMessages ?? [{ role: "user", content: opts.prompt }];
  let clarifyUsed = opts.resumeMessages !== undefined; // a resume implies clarify already happened once
  const seenCalls = new Map<string, unknown>();

  if (opts.resumeClarifyAnswer !== undefined) {
    messages = [...messages, { role: "user", content: opts.resumeClarifyAnswer }];
  }

  for (let i = 0; i < maxIterations; i++) {
    const result = await opts.provider.generateMessages(PLAYLIST_SYSTEM_PROMPT, messages, MUSIC_AGENT_TOOLS);
    const calls = result.toolCalls ?? [];

    if (calls.length === 0) {
      throw new Error("agent turn produced no tool calls and no finalize_playlist");
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
        if (clarifyUsed) {
          toolMessages.push({
            role: "tool",
            callId: call.id,
            name: call.name,
            content: "clarify already used once this run — finalize with your best judgment instead.",
            isError: true,
          });
          continue;
        }
        const question = String(call.args.question ?? "");
        const options = Array.isArray(call.args.options) ? call.args.options.map(String).slice(0, 3) : [];
        clarifyUsed = true;
        // Bubble up to the caller (bot/Mini App) to collect the user's answer;
        // caller resumes the run with resumeMessages + resumeClarifyAnswer.
        messages.push({ role: "assistant", content: result.text, toolCalls: calls });
        throw new ClarifyNeededError(question, options, messages);
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
      } catch (e) {
        slots[slot] = {
          role: "tool",
          callId: call.id,
          name: call.name,
          content: e instanceof Error ? e.message : String(e),
          isError: true,
        };
      }
    });
    for (const m of slots) {
      if (m) toolMessages.push(m);
    }

    if (finalizeCall) {
      try {
        const args = parseFinalizeArgs(finalizeCall.args);
        const playlist = await resolveAndFinalize(opts.music, args, seenCalls);
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

  throw new MaxIterationsExceededError(maxIterations);
}
