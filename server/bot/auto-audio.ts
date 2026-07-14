import type { Api } from "grammy";
import type { AppDb } from "../db";
import { env } from "../env";
import { accent } from "./emoji";
import { createTelegramAudioSender } from "../audio/telegram-sender";
import { YtDlpExtractor } from "../audio/extractor";
import { deliverTrack, type AudioSender, type DeliverDeps } from "../audio/deliver";
import type { DownloadTrack } from "../audio/downloads-store";
import type { Track } from "../music/types";

function summaryText(playlistName: string, sent: number, failed: number, failures: string[]): string {
  const check = accent("check");
  const cross = accent("cross");
  const warning = accent("warning");
  if (failed === 0) return `${check ? check + " " : ""}«${playlistName}»: все ${sent} треков отправлены.`;
  const lines = failures.map((f) => `• ${f}`);
  if (sent === 0) return [`${cross ? cross + " " : ""}«${playlistName}»: не удалось скачать треки:`, ...lines].join("\n");
  return [`${warning ? warning + " " : ""}«${playlistName}»: отправлено ${sent} из ${sent + failed}. Не получилось:`, ...lines].join("\n");
}

function toDownloadTrack(t: Track): DownloadTrack {
  return { uri: t.uri, title: t.title, artist: t.artist, durationMs: t.durationMs, status: "pending" };
}

export async function deliverAutoAudio(db: AppDb, chatId: number, tracks: Track[], playlistName: string, api: Api): Promise<void> {
  if (tracks.length === 0) return;

  const sender: AudioSender = createTelegramAudioSender(api);
  const deps: DeliverDeps = {
    sender,
    extractor: new YtDlpExtractor(),
    scratchDir: env.audioScratchDir,
  };

  let sent = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const t of tracks) {
    try {
      await deliverTrack(db, chatId, toDownloadTrack(t), deps);
      sent++;
    } catch {
      failed++;
      failures.push(`${t.artist} — ${t.title}`);
    }
  }

  try {
    await sender.sendText(chatId, summaryText(playlistName, sent, failed, failures));
  } catch {
    // user may have blocked the bot — non-critical
  }
}
