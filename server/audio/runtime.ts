import type { Api } from "grammy";
import { env } from "../env";
import type { DeliverDeps } from "./deliver";
import { YtDlpExtractor } from "./extractor";
import { YtDlpStreamResolver } from "./stream-resolver";
import { createTelegramAudioSender } from "./telegram-sender";

/** Shared process-wide instances keep yt-dlp URL/cache work reusable everywhere. */
export const runtimeExtractor = new YtDlpExtractor();
export const runtimeStreamResolver = new YtDlpStreamResolver();

export function createRuntimeAudioDeps(api: Api): DeliverDeps {
  return {
    sender: createTelegramAudioSender(api),
    extractor: runtimeExtractor,
    scratchDir: env.audioScratchDir,
    streamResolver: runtimeStreamResolver,
  };
}
