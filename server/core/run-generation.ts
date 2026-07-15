import type { AppDb } from "../db";
import { createProvider, isProviderId, MissingCredentialError, type ProviderId } from "../agent/registry";
import { createMusicProvider, isMusicBackend } from "../music/registry";
import { getActiveProviderId, getActiveBackendId, getProviderOverrides } from "../lib/settings";
import { hasAccess, consumeAccess } from "../access/entitlements";
import { insertGeneration } from "../access/generations-store";
import {
  ClarifyNeededError,
  MaxIterationsExceededError,
  NoTracksResolvedError,
  generatePlaylist,
  type FinalizedPlaylist,
  type GeneratePlaylistOptions,
} from "./generate-playlist";
import type { AgentEvent, AgentMessage } from "../agent/types";
import { verifyTracks, verificationStore } from "../audio/track-verification";
import type { Extractor } from "../audio/extractor";

export type GenerationOutcome =
  | { status: "ok"; playlist: FinalizedPlaylist }
  | { status: "clarify"; question: string; options: string[]; messages: AgentMessage[] }
  | { status: "needs_purchase" }
  | { status: "error"; message: string };

const DEFAULT_PROVIDER: ProviderId = "opencode";

async function buildRunInputs(db: AppDb) {
  // Stored value may be a legacy/removed provider (e.g. "openrouter") — fall
  // back to the default rather than throwing so existing chats keep working.
  const storedProvider = getActiveProviderId(db, DEFAULT_PROVIDER);
  const providerId = isProviderId(storedProvider) ? storedProvider : DEFAULT_PROVIDER;
  const provider = createProvider(providerId, getProviderOverrides(db, providerId));

  // Stored value may be a legacy/removed backend (e.g. "spotify") — fall back
  // to the default rather than throwing so existing chats keep working.
  const stored = getActiveBackendId(db, "youtube-music");
  const backendId = isMusicBackend(stored) ? stored : "youtube-music";

  const music = createMusicProvider(backendId);
  return { provider, music };
}

async function toOutcome(run: () => ReturnType<typeof generatePlaylist>): Promise<GenerationOutcome> {
  try {
    const { playlist } = await run();
    return { status: "ok", playlist };
  } catch (e) {
    if (e instanceof ClarifyNeededError) {
      return { status: "clarify", question: e.question, options: e.options, messages: e.messages };
    }
    if (e instanceof MaxIterationsExceededError) {
      return { status: "error", message: "Не удалось подобрать плейлист вовремя — уточните запрос." };
    }
    if (e instanceof NoTracksResolvedError) {
      return { status: "error", message: "Музыкальный сервис сейчас недоступен — треки не нашлись. Попробуйте ещё раз чуть позже." };
    }
    if (e instanceof MissingCredentialError) {
      return { status: "error", message: e.message };
    }
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

function fireVerification(playlist: FinalizedPlaylist): void {
  if (!_extractor) return;
  verifyTracks(playlist.tracks, _extractor, verificationStore).catch(() => {});
}

export async function startGeneration(
  db: AppDb,
  chatId: number,
  prompt: string,
  onEvent?: (e: AgentEvent) => void,
): Promise<GenerationOutcome> {
  if (!hasAccess(db, chatId)) return { status: "needs_purchase" };
  const outcome = await toOutcome(async () => {
    const { provider, music } = await buildRunInputs(db);
    const opts: GeneratePlaylistOptions = { provider, music, prompt, onEvent };
    return generatePlaylist(opts);
  });
  if (outcome.status === "ok") {
    consumeAccess(db, chatId);
    insertGeneration(db, chatId, prompt, outcome.playlist.name, outcome.playlist.tracks.length);
    fireVerification(outcome.playlist);
  }
  return outcome;
}

export async function resumeGeneration(
  db: AppDb,
  chatId: number,
  originalPrompt: string,
  resumeMessages: AgentMessage[],
  clarifyAnswer: string,
  onEvent?: (e: AgentEvent) => void,
): Promise<GenerationOutcome> {
  if (!hasAccess(db, chatId)) return { status: "needs_purchase" };
  const outcome = await toOutcome(async () => {
    const { provider, music } = await buildRunInputs(db);
    return generatePlaylist({
      provider,
      music,
      prompt: originalPrompt,
      resumeMessages,
      resumeClarifyAnswer: clarifyAnswer,
      onEvent,
    });
  });
  if (outcome.status === "ok") {
    consumeAccess(db, chatId);
    insertGeneration(db, chatId, originalPrompt, outcome.playlist.name, outcome.playlist.tracks.length);
    fireVerification(outcome.playlist);
  }
  return outcome;
}

let _extractor: Extractor | null = null;

export function setVerificationExtractor(extractor: Extractor): void {
  _extractor = extractor;
}

export function formatPlaylistReply(playlist: FinalizedPlaylist): string {
  const lines = playlist.tracks.map((t, i) => {
    const link = t.deepLink ? ` — ${t.deepLink}` : "";
    return `${i + 1}. ${t.artist} — ${t.title}${link}`;
  });
  const header = playlist.remotePlaylistUrl
    ? `🎧 *${playlist.name}*\n${playlist.remotePlaylistUrl}`
    : `🎧 *${playlist.name}*`;
  return [header, "", ...lines].join("\n");
}
