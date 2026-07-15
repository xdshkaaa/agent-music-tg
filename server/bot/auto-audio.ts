import type { Api } from "grammy";
import type { AppDb } from "../db";
import { env } from "../env";
import { accent } from "./emoji";
import { createTelegramAudioSender } from "../audio/telegram-sender";
import { YtDlpExtractor } from "../audio/extractor";
import { deliverTrack, type AudioSender, type DeliverDeps } from "../audio/deliver";
import {
  finalStatusFor,
  insertDownload,
  setDownloadStatus,
  setDownloadTracks,
  type DownloadRecord,
  type DownloadTrack,
} from "../audio/downloads-store";
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

export async function deliverAutoAudio(
  db: AppDb,
  chatId: number,
  tracks: Track[],
  playlistName: string,
  api: Api,
  depsOverride: Partial<DeliverDeps> = {},
): Promise<void> {
  if (tracks.length === 0) return;

  const sender: AudioSender = createTelegramAudioSender(api);
  const deps: DeliverDeps = {
    sender,
    extractor: new YtDlpExtractor(),
    scratchDir: env.audioScratchDir,
    ...depsOverride,
  };

  // Record the delivery as a downloads entry so it shows up in the Mini App
  // «Загрузки» history, consistent with Mini App-initiated downloads.
  const downloadTracks: DownloadTrack[] = tracks.map(toDownloadTrack);
  const record: DownloadRecord = insertDownload(db, chatId, playlistName, downloadTracks);

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const failures: string[] = [];

  try {
    for (const dt of downloadTracks) {
      const status = await verificationStore.waitForFinal(dt.uri, 30_000);
      if (status === "unavailable") {
        skipped++;
        dt.status = "failed";
        dt.error = "недоступен";
        setDownloadTracks(db, record.id, downloadTracks);
        continue;
      }
      try {
        await deliverTrack(db, chatId, dt, deps);
        dt.status = "sent";
        delete dt.error;
        sent++;
      } catch (e) {
        failed++;
        dt.status = "failed";
        dt.error = e instanceof Error ? e.message : String(e);
        failures.push(`${dt.artist} — ${dt.title}`);
      }
      setDownloadTracks(db, record.id, downloadTracks);
    }

    setDownloadStatus(db, record.id, finalStatusFor(downloadTracks));
  } catch (e) {
    // Outer failure: mark the record as failed so it never hangs in `pending`.
    setDownloadStatus(db, record.id, finalStatusFor(downloadTracks));
    throw e;
  }

  try {
    await sender.sendText(chatId, summaryText(playlistName, sent, failed, skipped, failures));
  } catch {
    // user may have blocked the bot — non-critical
  }
}
