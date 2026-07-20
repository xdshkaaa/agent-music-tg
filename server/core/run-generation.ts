import type { AppDb } from "../db";
import { createProvider, isProviderId, MissingCredentialError, type ProviderId } from "../agent/registry";
import { createMusicProvider, isMusicBackend } from "../music/registry";
import { getActiveProviderId, getActiveBackendId, getProviderOverrides } from "../lib/settings";
import { hasAccess, consumeAccess, checkSubscriptionRateLimit } from "../access/entitlements";
import { insertGeneration, getGeneration, appendTracksToGeneration, incrementExtendCount } from "../access/generations-store";
import { getUserMusicBackend } from "../access/users-store";
import { listDislikedForPrompt, listDislikedUris } from "../access/reactions-store";
import {
  ClarifyNeededError,
  MaxIterationsExceededError,
  NoTracksResolvedError,
  generatePlaylist,
  type FinalizedPlaylist,
  type GeneratePlaylistOptions,
  type GeneratePlaylistResult,
} from "./generate-playlist";
import { buildExtendSystemPrompt } from "../agent/prompts";
import type { AgentEvent, AgentMessage } from "../agent/types";
import { verifyTracks, verificationStore } from "../audio/track-verification";
import type { Extractor } from "../audio/extractor";
import type { StreamResolver } from "../audio/stream-resolver";
import { mapWithConcurrency } from "./concurrency";

export type GenerationOutcome =
  | { status: "ok"; playlist: FinalizedPlaylist; generationId: number }
  | { status: "clarify"; question: string; options: string[]; messages: AgentMessage[]; round: number }
  | { status: "needs_purchase" }
  | { status: "rate_limited"; retryAt: number }
  | { status: "error"; message: string };

/** Paywall + subscription rate limit, shared by all generation entrypoints. */
function gateAccess(db: AppDb, chatId: number): GenerationOutcome | null {
  if (!hasAccess(db, chatId)) return { status: "needs_purchase" };
  const rate = checkSubscriptionRateLimit(db, chatId);
  if (rate.limited) return { status: "rate_limited", retryAt: rate.retryAt };
  return null;
}

const DEFAULT_PROVIDER: ProviderId = "opencode";

/** Extends of one playlist that are free before each extend costs a credit. */
export const EXTEND_FREE_LIMIT = 3;

async function buildRunInputs(db: AppDb, chatId: number) {
  // Stored value may be a legacy/removed provider (e.g. "openrouter") — fall
  // back to the default rather than throwing so existing chats keep working.
  const storedProvider = getActiveProviderId(db, DEFAULT_PROVIDER);
  const providerId = isProviderId(storedProvider) ? storedProvider : DEFAULT_PROVIDER;
  const provider = createProvider(providerId, getProviderOverrides(db, providerId));

  // Per-user override takes priority; falls back to the admin-wide default.
  // Stored value may be a legacy/removed backend (e.g. "spotify") — fall back
  // to the default rather than throwing so existing chats keep working.
  const userBackend = getUserMusicBackend(db, chatId);
  const stored = userBackend && isMusicBackend(userBackend) ? userBackend : getActiveBackendId(db, "youtube-music");
  const backendId = isMusicBackend(stored) ? stored : "youtube-music";

  const music = createMusicProvider(backendId);
  return { provider, music };
}

/** Disliked tracks are excluded from every generation: nudged in the prompt, hard-filtered from results. */
function buildDislikeOpts(db: AppDb, chatId: number): { dislikedTracks: string[]; dislikedUris: Set<string> } {
  return { dislikedTracks: listDislikedForPrompt(db, chatId), dislikedUris: listDislikedUris(db, chatId) };
}

type RunResult = { status: "ok"; playlist: FinalizedPlaylist } | Exclude<GenerationOutcome, { status: "ok" }>;

async function toOutcome(run: () => Promise<GeneratePlaylistResult>): Promise<RunResult> {
  try {
    const { playlist } = await run();
    return { status: "ok", playlist };
  } catch (e) {
    if (e instanceof ClarifyNeededError) {
      return { status: "clarify", question: e.question, options: e.options, messages: e.messages, round: e.round };
    }
    if (e instanceof MaxIterationsExceededError) {
      return { status: "error", message: "Не удалось подобрать плейлист вовремя. Уточните запрос." };
    }
    if (e instanceof NoTracksResolvedError) {
      return { status: "error", message: "Музыкальный сервис сейчас недоступен, треки не нашлись. Попробуйте ещё раз чуть позже." };
    }
    if (e instanceof MissingCredentialError) {
      return { status: "error", message: e.message };
    }
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

function fireVerification(playlist: FinalizedPlaylist): void {
  // Resolve signed upstream URLs in the background so playback can proxy bytes
  // immediately without downloading and transcoding full MP3 files first.
  // Resolution also verifies availability, avoiding a duplicate yt-dlp probe.
  if (_streamResolver) {
    const resolver = _streamResolver;
    void mapWithConcurrency(playlist.tracks, 2, async (t) => {
      verificationStore.set(t.uri, "checking");
      try {
        await resolver.resolve(t.uri);
        verificationStore.set(t.uri, "verified");
      } catch {
        verificationStore.set(t.uri, "unavailable");
      }
    });
  } else if (_extractor) {
    verifyTracks(playlist.tracks, _extractor, verificationStore).catch(() => {});
  }
}

export async function startGeneration(
  db: AppDb,
  chatId: number,
  prompt: string,
  onEvent?: (e: AgentEvent) => void,
): Promise<GenerationOutcome> {
  const gated = gateAccess(db, chatId);
  if (gated) return gated;

  const outcome = await toOutcome(async () => {
    const { provider, music } = await buildRunInputs(db, chatId);
    const opts: GeneratePlaylistOptions = { provider, music, prompt, onEvent, ...buildDislikeOpts(db, chatId) };
    return generatePlaylist(opts);
  });
  if (outcome.status === "ok") {
    const generationId = insertGeneration(
      db,
      chatId,
      prompt,
      outcome.playlist.name,
      outcome.playlist.tracks.length,
      outcome.playlist.tracks,
    );
    consumeAccess(db, chatId);
    fireVerification(outcome.playlist);
    return { status: "ok", playlist: outcome.playlist, generationId };
  }
  return outcome;
}

export async function resumeGeneration(
  db: AppDb,
  chatId: number,
  originalPrompt: string,
  resumeMessages: AgentMessage[],
  clarifyAnswer: string,
  priorRound: number,
  onEvent?: (e: AgentEvent) => void,
): Promise<GenerationOutcome> {
  const gated = gateAccess(db, chatId);
  if (gated) return gated;
  const outcome = await toOutcome(async () => {
    const { provider, music } = await buildRunInputs(db, chatId);
    return generatePlaylist({
      provider,
      music,
      prompt: originalPrompt,
      resumeMessages,
      resumeClarifyAnswer: clarifyAnswer,
      resumeClarifyRound: priorRound,
      onEvent,
      ...buildDislikeOpts(db, chatId),
    });
  });
  if (outcome.status === "ok") {
    const generationId = insertGeneration(
      db,
      chatId,
      originalPrompt,
      outcome.playlist.name,
      outcome.playlist.tracks.length,
      outcome.playlist.tracks,
    );
    consumeAccess(db, chatId);
    fireVerification(outcome.playlist);
    return { status: "ok", playlist: outcome.playlist, generationId };
  }
  return outcome;
}

/**
 * Appends tracks to a playlist the user created earlier (identified by its
 * generation id). Loads the existing tracks as read-only base context, runs the
 * agent in extend mode, then overwrites the generation's stored track list with
 * the merged result. Consumes one access credit, like a fresh generation.
 */
export async function extendGeneration(
  db: AppDb,
  chatId: number,
  generationId: number,
  prompt: string,
  onEvent?: (e: AgentEvent) => void,
): Promise<GenerationOutcome> {
  const existing = getGeneration(db, chatId, generationId);
  if (!existing) return { status: "error", message: "Плейлист не найден или уже недоступен." };

  // The first EXTEND_FREE_LIMIT extends of a playlist are free (no paywall,
  // no credit) — later ones are gated and charged like a fresh generation.
  const freeExtend = existing.extendCount < EXTEND_FREE_LIMIT;
  if (!freeExtend) {
    const gated = gateAccess(db, chatId);
    if (gated) return gated;
  }

  const outcome = await toOutcome(async () => {
    const { provider, music } = await buildRunInputs(db, chatId);
    const baseTracks = existing.tracks.map((t) => ({ artist: t.artist, title: t.title }));
    return generatePlaylist({
      provider,
      music,
      prompt,
      mode: "extend",
      baseTracks,
      baseName: existing.playlistName ?? undefined,
      systemPrompt: buildExtendSystemPrompt(existing.playlistName ?? "Playlist", baseTracks),
      onEvent,
      ...buildDislikeOpts(db, chatId),
    });
  });
  if (outcome.status === "ok") {
    appendTracksToGeneration(db, generationId, outcome.playlist.tracks, outcome.playlist.name);
    incrementExtendCount(db, generationId);
    if (!freeExtend) consumeAccess(db, chatId);
    fireVerification(outcome.playlist);
    return { status: "ok", playlist: outcome.playlist, generationId };
  }
  return outcome;
}

let _extractor: Extractor | null = null;
let _streamResolver: StreamResolver | null = null;

export function setPrewarmStreamResolver(resolver: StreamResolver): void {
  _streamResolver = resolver;
}

export function setVerificationExtractor(extractor: Extractor): void {
  _extractor = extractor;
}
