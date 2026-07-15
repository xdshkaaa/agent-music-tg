import type { Track } from "../music/types";
import type { Extractor, ProbeResult } from "./extractor";
import { mapWithConcurrency } from "../core/concurrency";

export type TrackVerificationStatus = "pending" | "checking" | "verified" | "unavailable";

export class TrackVerificationStore {
  private map = new Map<string, TrackVerificationStatus>();
  private resolvers = new Map<string, Array<(status: TrackVerificationStatus) => void>>();

  get(uri: string): TrackVerificationStatus {
    return this.map.get(uri) ?? "pending";
  }

  set(uri: string, status: TrackVerificationStatus): void {
    this.map.set(uri, status);
    const resolvers = this.resolvers.get(uri);
    if (resolvers) {
      for (const resolve of resolvers) resolve(status);
      this.resolvers.delete(uri);
    }
  }

  /** Returns a promise that resolves when the status is no longer "pending" or "checking". */
  waitForFinal(uri: string, timeoutMs: number = 30_000): Promise<TrackVerificationStatus> {
    const current = this.get(uri);
    if (current !== "pending" && current !== "checking") return Promise.resolve(current);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const list = this.resolvers.get(uri);
        if (list) {
          const idx = list.indexOf(resolve);
          if (idx !== -1) list.splice(idx, 1);
        }
        resolve(this.get(uri));
      }, timeoutMs);
      const list = this.resolvers.get(uri) ?? [];
      list.push((status) => {
        clearTimeout(timer);
        resolve(status);
      });
      this.resolvers.set(uri, list);
    });
  }

  entries(): IterableIterator<[string, TrackVerificationStatus]> {
    return this.map.entries();
  }

  getSnapshot(uris: string[]): Record<string, TrackVerificationStatus> {
    const result: Record<string, TrackVerificationStatus> = {};
    for (const uri of uris) {
      result[uri] = this.get(uri);
    }
    return result;
  }
}

export const verificationStore = new TrackVerificationStore();

async function checkTrack(uri: string, extractor: Extractor, store: TrackVerificationStore): Promise<void> {
  store.set(uri, "checking");
  try {
    const result: ProbeResult = await extractor.probe(uri);
    store.set(uri, result.available ? "verified" : "unavailable");
  } catch {
    store.set(uri, "unavailable");
  }
}

export async function verifyTracks(
  tracks: Track[],
  extractor: Extractor,
  store: TrackVerificationStore,
): Promise<void> {
  await mapWithConcurrency(tracks, 8, (t) => checkTrack(t.uri, extractor, store).catch(() => {}));
}
