import type { AppDb } from "../db";
import { createProvider, isProviderId, MissingCredentialError, type ProviderId } from "../agent/registry";
import { createMusicProvider, isMusicBackend } from "../music/registry";
import { getActiveProviderId, getActiveBackendId, getProviderOverrides } from "../lib/settings";
import { hasAccess, consumeAccess } from "../access/entitlements";
import { insertGeneration } from "../access/generations-store";
import {
  ClarifyNeededError,
  MaxIterationsExceededError,
  generatePlaylist,
  type FinalizedPlaylist,
  type GeneratePlaylistOptions,
} from "./generate-playlist";
import type { AgentMessage } from "../agent/types";

export type GenerationOutcome =
  | { status: "ok"; playlist: FinalizedPlaylist }
  | { status: "clarify"; question: string; options: string[]; messages: AgentMessage[] }
  | { status: "needs_purchase" }
  | { status: "error"; message: string };

const DEFAULT_PROVIDER: ProviderId = "opencode";

async function buildRunInputs(db: AppDb) {
  const providerId = getActiveProviderId(db, DEFAULT_PROVIDER);
  if (!isProviderId(providerId)) throw new Error(`unknown active provider setting: ${providerId}`);
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
    if (e instanceof MissingCredentialError) {
      return { status: "error", message: e.message };
    }
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

export async function startGeneration(db: AppDb, chatId: number, prompt: string): Promise<GenerationOutcome> {
  if (!hasAccess(db, chatId)) return { status: "needs_purchase" };
  const outcome = await toOutcome(async () => {
    const { provider, music } = await buildRunInputs(db);
    const opts: GeneratePlaylistOptions = { provider, music, prompt };
    return generatePlaylist(opts);
  });
  if (outcome.status === "ok") {
    consumeAccess(db, chatId);
    insertGeneration(db, chatId, prompt, outcome.playlist.name, outcome.playlist.tracks.length);
  }
  return outcome;
}

export async function resumeGeneration(
  db: AppDb,
  chatId: number,
  originalPrompt: string,
  resumeMessages: AgentMessage[],
  clarifyAnswer: string,
): Promise<GenerationOutcome> {
  if (!hasAccess(db, chatId)) return { status: "needs_purchase" };
  const outcome = await toOutcome(async () => {
    const { provider, music } = await buildRunInputs(db);
    return generatePlaylist({ provider, music, prompt: originalPrompt, resumeMessages, resumeClarifyAnswer: clarifyAnswer });
  });
  if (outcome.status === "ok") consumeAccess(db, chatId);
  return outcome;
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
