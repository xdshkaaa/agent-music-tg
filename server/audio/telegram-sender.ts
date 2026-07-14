import { InputFile, type Api } from "grammy";
import type { AudioMeta, AudioSender } from "./deliver";

/** grammY-backed AudioSender used in production (see deliver.ts for the seam). */
export function createTelegramAudioSender(api: Api): AudioSender {
  const options = (meta: AudioMeta) => ({
    title: meta.title,
    performer: meta.performer,
    duration: meta.durationSeconds,
  });
  return {
    async sendAudioByFileId(chatId, fileId, meta) {
      await api.sendAudio(chatId, fileId, options(meta));
    },
    async sendAudioFile(chatId, filePath, meta) {
      const message = await api.sendAudio(chatId, new InputFile(filePath), options(meta));
      const fileId = message.audio?.file_id;
      if (!fileId) throw new Error("sendAudio returned no audio file_id");
      return fileId;
    },
    async sendText(chatId, text) {
      await api.sendMessage(chatId, text, { parse_mode: "HTML" });
    },
  };
}
