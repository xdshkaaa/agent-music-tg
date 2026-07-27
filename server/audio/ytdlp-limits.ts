import { createSemaphore } from "../core/concurrency";

/**
 * Process-wide caps on concurrent yt-dlp invocations. Every yt-dlp call also
 * starts a Node JS runtime (`--js-runtimes node`), so these bound real CPU and
 * RAM on the VPS, not just a logical queue depth.
 *
 * The two paths get separate pools on purpose. Extraction runs up to 45s per
 * track (extractor.ts), streaming resolve up to 12s (stream-resolver.ts). One
 * shared pool would let a single download job starve playback for every user,
 * so they are bounded independently and the ceiling is the sum.
 */

/** Downloads-to-chat: matches the previous per-job default. */
export const extractionSemaphore = createSemaphore(2);

/** In-app playback: shorter-lived, so a slightly wider pool stays safe. */
export const streamResolveSemaphore = createSemaphore(4);
