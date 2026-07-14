import type { Api } from "grammy";
import type { AppDb } from "../db";
import { env } from "../env";
import { accent } from "./emoji";
import { createTelegramAudioSender } from "../audio/telegram-sender";
import { YtDlpExtractor } from "../audio/extractor";
import { deliverTrack, type AudioSender, type DeliverDeps } from "../audio/deliver";
import type { DownloadTrack } from "../audio/downloads-store";
import type { Track } from "../music/types";
import { verificationStore } from "../audio/track-verification";

function summaryText(playlistName: string, sent: number, failed: number, skipped: number, failures: string[]): string {
  const check = accent("check");
  const cross = accent("cross");
  const warning = accent("warning");
  if (failed === 0 && skipped === 0) return `${check ? check + " " : ""}«${playlistName}»: все ${sent} треков отправлены.`;
  const parts: string[] = [];
  if (failed > 0) {
    const lines = failures.map((f) => `• ${f}`);
    parts.push(...lines);
  }
  if (skipped > 0) {
    parts.push(`• ${skipped} треков недоступны — пропущены`);
  }
  if (sent === 0) return [`${cross ? cross + " " : ""}«${playlistName}»: не удалось скачать треки:`, ...parts].join("\n");
  return [`${warning ? warning + " " : ""}«${playlistName}»: отправлено ${sent}, недоступно ${skipped}, ошибок ${failed}.`, ...parts].join("\n");
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
  let skipped = 0;
  const failures: string[] = [];

  for (const t of tracks) {
    const status = await verificationStore.waitForFinal(t.uri, 30_000);
    if (status === "unavailable") {
      skipped++;
      continue;
    }
    try {
      await deliverTrack(db, chatId, toDownloadTrack(t), deps);
      sent++;
    } catch {
      failed++;
      failures.push(`${t.artist} — ${t.title}`);
    }
  }

  try {
    await sender.sendText(chatId, summaryText(playlistName, sent, failed, skipped, failures));
  } catch {
    // user may have blocked the bot — non-critical
  }
}
