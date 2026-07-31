import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { api as clientApi } from "./api";

export interface MyMusicTrack {
  uri: string;
  title: string;
  artist: string;
  artwork?: string | null;
}

/** The slice of `api` this store needs — injectable so tests don't hit the network. */
export interface MyMusicApi {
  myMusic: () => Promise<{ tracks: { uri: string }[] }>;
  addMyMusic: (track: MyMusicTrack) => Promise<{ ok: boolean }>;
  removeMyMusic: (uri: string) => Promise<{ ok: boolean }>;
}

interface MyMusicSnapshot {
  ready: boolean;
  saved: Record<string, boolean>;
  pending: Record<string, boolean>;
}

/**
 * Single source of truth for "is this track in my music", shared by every
 * screen that shows a save/like affordance (artist, search, results,
 * playlists, the mini player, the full player). Previously each screen kept
 * its own copy of `api.myMusic()` with no way to hear about a change made
 * elsewhere — liking a track in the player left every other open screen's
 * heart stale until it happened to remount. A plain class (not a hook)
 * mirrors `PlaybackFeedbackTracker` in `player.tsx`: the logic is testable
 * without a DOM or a React renderer, and `MyMusicProvider` below is a thin
 * `useSyncExternalStore` wrapper around one shared instance.
 */
export class MyMusicStore {
  private snapshot: MyMusicSnapshot = { ready: false, saved: {}, pending: {} };
  private listeners = new Set<() => void>();

  constructor(private api: MyMusicApi) {}

  get ready(): boolean {
    return this.snapshot.ready;
  }

  getSnapshot = (): MyMusicSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  isSaved(uri: string): boolean {
    return !!this.snapshot.saved[uri];
  }

  isPending(uri: string): boolean {
    return !!this.snapshot.pending[uri];
  }

  async hydrate(): Promise<void> {
    try {
      const { tracks } = await this.api.myMusic();
      this.update({ ready: true, saved: Object.fromEntries(tracks.map((t) => [t.uri, true])) });
    } catch {
      // Leave saved empty; toggling still works, just without prior hydration
      // (matches the previous per-screen fallback behavior).
      this.update({ ready: true });
    }
  }

  /** Resolves `true` once the new state is confirmed, `false` if the request
   * failed and the optimistic change was rolled back — callers that need to
   * know whether a track actually left the list (not just that the promise
   * settled) branch on this instead of re-deriving it from a snapshot that
   * may already be stale by the time the `await` returns. */
  async toggleSaved(track: MyMusicTrack): Promise<boolean> {
    const wasSaved = this.isSaved(track.uri);
    this.update({
      saved: { ...this.snapshot.saved, [track.uri]: !wasSaved },
      pending: { ...this.snapshot.pending, [track.uri]: true },
    });
    let succeeded = true;
    try {
      if (wasSaved) {
        await this.api.removeMyMusic(track.uri);
      } else {
        await this.api.addMyMusic(track);
      }
    } catch {
      // Roll back to the pre-toggle state; the user can retry.
      succeeded = false;
      this.update({ saved: { ...this.snapshot.saved, [track.uri]: wasSaved } });
    } finally {
      const { [track.uri]: _drop, ...pending } = this.snapshot.pending;
      this.update({ pending });
    }
    return succeeded;
  }

  private update(partial: Partial<MyMusicSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    this.listeners.forEach((listener) => listener());
  }
}

export interface MyMusicApiPublic {
  ready: boolean;
  isSaved: (uri: string) => boolean;
  isPending: (uri: string) => boolean;
  /** Resolves to whether the toggle stuck (false = the request failed and rolled back). */
  toggleSaved: (track: MyMusicTrack) => Promise<boolean>;
}

const MyMusicContext = createContext<MyMusicStore | null>(null);

export function MyMusicProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => new MyMusicStore(clientApi), []);

  useEffect(() => {
    void store.hydrate();
  }, [store]);

  return <MyMusicContext.Provider value={store}>{children}</MyMusicContext.Provider>;
}

export function useMyMusic(): MyMusicApiPublic {
  const store = useContext(MyMusicContext);
  if (!store) throw new Error("useMyMusic must be used inside MyMusicProvider");

  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);

  return {
    ready: snapshot.ready,
    isSaved: (uri: string) => !!snapshot.saved[uri],
    isPending: (uri: string) => !!snapshot.pending[uri],
    toggleSaved: (track: MyMusicTrack) => store.toggleSaved(track),
  };
}
