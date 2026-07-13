import type { AppDb } from "../db";
import { createProvider, isProviderId, MissingCredentialError, type ProviderId } from "../agent/registry";
import { createMusicProvider, isMusicBackend, SpotifyLinkRequiredError } from "../music/registry";
import { getActiveProviderId, getActiveBackendId } from "../lib/settings";
import { getValidAccessToken, SpotifyNotLinkedError } from "../spotify/tokens";
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
  | { status: "error"; message: string };

const DEFAULT_PROVIDER: ProviderId = "anthropic";

async function buildRunInputs(db: AppDb, chatId: number) {
  const providerId = getActiveProviderId(db, DEFAULT_PROVIDER);
  if (!isProviderId(providerId)) throw new Error(`unknown active provider setting: ${providerId}`);
  const provider = createProvider(providerId);

  const backendId = getActiveBackendId(db, "spotify");
  if (!isMusicBackend(backendId)) throw new Error(`unknown active backend setting: ${backendId}`);

  let spotifyAccessToken: string | undefined;
  if (backendId === "spotify") {
    spotifyAccessToken = await getValidAccessToken(db, chatId);
  }
  const music = createMusicProvider(backendId, { spotifyAccessToken });
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
      return { status: "error", message: "Couldn't settle on a playlist in time — try a more specific request." };
    }
    if (e instanceof MissingCredentialError) {
      return { status: "error", message: e.message };
    }
    if (e instanceof SpotifyLinkRequiredError || e instanceof SpotifyNotLinkedError) {
      return { status: "error", message: "Link your Spotify account first with /link." };
    }
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

export async function startGeneration(db: AppDb, chatId: number, prompt: string): Promise<GenerationOutcome> {
  return toOutcome(async () => {
    const { provider, music } = await buildRunInputs(db, chatId);
    const opts: GeneratePlaylistOptions = { provider, music, prompt };
    return generatePlaylist(opts);
  });
}

export async function resumeGeneration(
  db: AppDb,
  chatId: number,
  originalPrompt: string,
  resumeMessages: AgentMessage[],
  clarifyAnswer: string,
): Promise<GenerationOutcome> {
  return toOutcome(async () => {
    const { provider, music } = await buildRunInputs(db, chatId);
    return generatePlaylist({ provider, music, prompt: originalPrompt, resumeMessages, resumeClarifyAnswer: clarifyAnswer });
  });
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
