import { InputFile, type Api } from "grammy";
import type { AudioMeta, AudioSender } from "./deliver";
import { fetchThumbnailBytes } from "./thumbnail";

/**
 * Telegram doesn't derive the audio thumbnail from embedded ID3 art — it
 * needs an explicit `thumbnail` upload. `meta.artworkBytes`, when present, is
 * a fetch deliver.ts already started alongside extraction (so by the time
 * sendAudio needs it, it has usually already resolved); otherwise falls back
 * to fetching `artworkUrl` fresh here, e.g. on the cache-hit path, which has
 * no extraction step to overlap the fetch with.
 */
async function resolveThumbnail(meta: AudioMeta): Promise<InputFile | undefined> {
  const bytes = meta.artworkBytes ? await meta.artworkBytes : await fetchThumbnailBytes(meta.artworkUrl);
  return bytes ? new InputFile(bytes) : undefined;
}

/** grammY-backed AudioSender used in production (see deliver.ts for the seam). */
export function createTelegramAudioSender(api: Api): AudioSender {
  const options = async (meta: AudioMeta) => ({
    title: meta.title,
    performer: meta.performer,
    duration: meta.durationSeconds,
    thumbnail: await resolveThumbnail(meta),
    ...(meta.caption != null ? { caption: meta.caption, parse_mode: "HTML" as const } : {}),
    ...(meta.replyToMessageId != null
      ? { reply_parameters: { message_id: meta.replyToMessageId, allow_sending_without_reply: true } }
      : {}),
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
    async sendAudioStream(chatId, stream, filename, meta) {
      const message = await api.sendAudio(chatId, new InputFile(stream, filename), await options(meta));
      const fileId = message.audio?.file_id;
      if (!fileId) throw new Error("sendAudio returned no audio file_id");
      return fileId;
    },
    async sendText(chatId, text) {
      await api.sendMessage(chatId, text, { parse_mode: "HTML" });
    },
  };
}
