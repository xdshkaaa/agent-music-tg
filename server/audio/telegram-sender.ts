import { InputFile, type Api } from "grammy";
import type { AudioMeta, AudioSender } from "./deliver";

const THUMBNAIL_FETCH_TIMEOUT_MS = 5_000;

/**
 * Telegram doesn't derive the audio thumbnail from embedded ID3 art — it
 * needs an explicit `thumbnail` upload. Fetches the track's artwork so it can
 * be attached; returns undefined (never throws) if that fails, so a slow or
 * dead artwork URL never blocks the audio itself from sending.
 */
async function fetchThumbnail(url: string | undefined): Promise<InputFile | undefined> {
  if (!url) return undefined;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(THUMBNAIL_FETCH_TIMEOUT_MS) });
    if (!res.ok) return undefined;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return new InputFile(bytes);
  } catch {
    return undefined;
  }
}

/** grammY-backed AudioSender used in production (see deliver.ts for the seam). */
export function createTelegramAudioSender(api: Api): AudioSender {
  const options = async (meta: AudioMeta) => ({
    title: meta.title,
    performer: meta.performer,
    duration: meta.durationSeconds,
    thumbnail: await fetchThumbnail(meta.artworkUrl),
  });
  return {
    async sendAudioByFileId(chatId, fileId, meta) {
      await api.sendAudio(chatId, fileId, await options(meta));
    },
    async sendAudioFile(chatId, filePath, meta) {
      const message = await api.sendAudio(chatId, new InputFile(filePath), await options(meta));
      const fileId = message.audio?.file_id;
      if (!fileId) throw new Error("sendAudio returned no audio file_id");
      return fileId;
    },
    async sendText(chatId, text) {
      await api.sendMessage(chatId, text, { parse_mode: "HTML" });
    },
  };
}
