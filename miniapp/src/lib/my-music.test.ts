import { describe, expect, test } from "bun:test";
import { MyMusicStore, type MyMusicApi } from "./my-music";

const track = { uri: "ytm:a", title: "Xtal", artist: "Aphex Twin", artwork: null };
const otherTrack = { uri: "ytm:b", title: "Alberto Balsalm", artist: "Aphex Twin", artwork: null };

function fakeApi(overrides: Partial<MyMusicApi> = {}): MyMusicApi {
  return {
    myMusic: async () => ({ tracks: [] }),
    addMyMusic: async () => ({ ok: true }),
    removeMyMusic: async () => ({ ok: true }),
    ...overrides,
  };
}

describe("MyMusicStore hydration", () => {
  test("populates saved state from the server's track list", async () => {
    const store = new MyMusicStore(
      fakeApi({ myMusic: async () => ({ tracks: [{ ...track, createdAt: 0 }] }) }),
    );
    expect(store.isSaved(track.uri)).toBe(false);

    await store.hydrate();

    expect(store.isSaved(track.uri)).toBe(true);
    expect(store.isSaved(otherTrack.uri)).toBe(false);
  });

  test("is not ready until hydration completes", async () => {
    const store = new MyMusicStore(fakeApi());
    expect(store.ready).toBe(false);
    await store.hydrate();
    expect(store.ready).toBe(true);
  });
});

describe("MyMusicStore.toggleSaved", () => {
  test("optimistically marks a track saved before the request resolves", async () => {
    const store = new MyMusicStore(fakeApi());
    const promise = store.toggleSaved(track);
    expect(store.isSaved(track.uri)).toBe(true);
    await promise;
    expect(store.isSaved(track.uri)).toBe(true);
  });

  test("optimistically unmarks an already-saved track", async () => {
    const store = new MyMusicStore(
      fakeApi({ myMusic: async () => ({ tracks: [{ ...track, createdAt: 0 }] }) }),
    );
    await store.hydrate();

    const promise = store.toggleSaved(track);
    expect(store.isSaved(track.uri)).toBe(false);
    await promise;
    expect(store.isSaved(track.uri)).toBe(false);
  });

  test("rolls back to unsaved when the add request fails", async () => {
    const store = new MyMusicStore(
      fakeApi({
        addMyMusic: async () => {
          throw new Error("network down");
        },
      }),
    );

    await store.toggleSaved(track);

    expect(store.isSaved(track.uri)).toBe(false);
  });

  test("rolls back to saved when the remove request fails", async () => {
    const store = new MyMusicStore(
      fakeApi({
        myMusic: async () => ({ tracks: [{ ...track, createdAt: 0 }] }),
        removeMyMusic: async () => {
          throw new Error("network down");
        },
      }),
    );
    await store.hydrate();

    await store.toggleSaved(track);

    expect(store.isSaved(track.uri)).toBe(true);
  });

  test("resolves true on success and false when rolled back, so a caller can tell them apart", async () => {
    const succeeding = new MyMusicStore(fakeApi());
    expect(await succeeding.toggleSaved(track)).toBe(true);

    const failing = new MyMusicStore(
      fakeApi({
        addMyMusic: async () => {
          throw new Error("network down");
        },
      }),
    );
    expect(await failing.toggleSaved(track)).toBe(false);
  });

  test("marks a track pending only for the duration of its own request", async () => {
    let resolveAdd!: () => void;
    const store = new MyMusicStore(
      fakeApi({
        addMyMusic: () =>
          new Promise((resolve) => {
            resolveAdd = () => resolve({ ok: true });
          }),
      }),
    );

    const promise = store.toggleSaved(track);
    expect(store.isPending(track.uri)).toBe(true);
    expect(store.isPending(otherTrack.uri)).toBe(false);

    resolveAdd();
    await promise;

    expect(store.isPending(track.uri)).toBe(false);
  });
});

describe("MyMusicStore.subscribe", () => {
  test("notifies listeners whenever the saved state changes", async () => {
    const store = new MyMusicStore(fakeApi());
    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications++;
    });

    await store.toggleSaved(track);
    unsubscribe();
    await store.toggleSaved(otherTrack);

    // Optimistic set + settle = 2 notifications for the first toggle;
    // unsubscribing must stop the count from moving for the second.
    expect(notifications).toBe(2);
  });
});
