import { describe, expect, test, afterEach } from "bun:test";
import { SoundCloudBackend } from "./soundcloud-backend";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Serves canned api-v2 payloads and records the paths requested. */
function stubApi(routes: Record<string, unknown>): { paths: string[] } {
  const paths: string[] = [];
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    paths.push(url.pathname);
    const body = routes[url.pathname];
    if (body === undefined) return Promise.resolve(new Response("not found", { status: 404 }));
    return Promise.resolve(Response.json(body));
  }) as typeof fetch;
  return { paths };
}

describe("SoundCloudBackend.getArtistDetails", () => {
  test("maps followers, bio and the real avatar", async () => {
    stubApi({
      "/users/12345": {
        id: 12345,
        username: "Aphex Twin",
        avatar_url: "https://i1.sndcdn.com/avatar.jpg",
        followers_count: 987654,
        description: "Cornish electronic musician.",
      },
    });
    // A unique id per test keeps the process-wide search cache from serving
    // another test's payload.
    const details = await new SoundCloudBackend("test-client-id").getArtistDetails("12345");
    expect(details).toEqual({
      id: "12345",
      name: "Aphex Twin",
      artwork: "https://i1.sndcdn.com/avatar.jpg",
      followers: 987654,
      description: "Cornish electronic musician.",
    });
  });

  test("omits fields SoundCloud did not report rather than sending nulls", async () => {
    stubApi({ "/users/22222": { id: 22222, username: "Someone" } });
    const details = await new SoundCloudBackend("test-client-id").getArtistDetails("22222");
    expect(details).toEqual({ id: "22222", name: "Someone", artwork: undefined });
    expect(details).not.toHaveProperty("followers");
    expect(details).not.toHaveProperty("description");
  });

  test("rejects an artistId that is not SoundCloud's opaque numeric id", async () => {
    stubApi({});
    await expect(new SoundCloudBackend("test-client-id").getArtistDetails("../admin"))
      .rejects.toThrow("invalid artistId");
  });
});

describe("SoundCloudBackend playability filtering", () => {
  // SoundCloud keeps preview-only and geo/rights-blocked tracks in its search
  // results, so a playlist could be handed a "song" that is really a 30-second
  // snippet or has no audio at all.
  const playable = {
    id: 10,
    title: "Playable",
    user: { username: "Someone" },
    duration: 200_000,
    policy: "ALLOW",
    media: { transcodings: [{ snipped: false }] },
  };
  const snipped = {
    id: 11,
    title: "Preview Only",
    user: { username: "Someone" },
    duration: 30_000,
    full_duration: 193_959,
    policy: "SNIP",
    media: { transcodings: [{ snipped: true }, { snipped: true }] },
  };
  const blocked = {
    id: 12,
    title: "Blocked",
    user: { username: "Someone" },
    duration: 210_000,
    policy: "BLOCK",
    media: { transcodings: [] },
  };

  test("drops preview-only and blocked tracks from search results", async () => {
    stubApi({ "/search/tracks": { collection: [snipped, blocked, playable] } });
    const tracks = await new SoundCloudBackend("test-client-id").searchTracks("snip-filter-query", 10);
    expect(tracks.map((t) => t.uri)).toEqual(["sc:10"]);
  });

  test("resolving one track skips a preview-only match for a playable one", async () => {
    stubApi({ "/search/tracks": { collection: [snipped, playable] } });
    const track = await new SoundCloudBackend("test-client-id").searchTrack("Someone", "Preview Only");
    expect(track?.uri).toBe("sc:10");
  });

  test("keeps tracks SoundCloud reports no media block for", async () => {
    stubApi({
      "/search/tracks": { collection: [{ id: 13, title: "Legacy", user: { username: "Someone" }, duration: 1000 }] },
    });
    const tracks = await new SoundCloudBackend("test-client-id").searchTracks("legacy-shape-query", 10);
    expect(tracks.map((t) => t.uri)).toEqual(["sc:13"]);
  });
});

describe("SoundCloudBackend.getArtistTopTracks", () => {
  test("carries per-track play and like counts through", async () => {
    stubApi({
      "/users/33333/toptracks": {
        collection: [
          {
            id: 1,
            title: "Xtal",
            user: { username: "Aphex Twin" },
            duration: 293000,
            playback_count: 1234567,
            likes_count: 4321,
          },
        ],
      },
    });
    const tracks = await new SoundCloudBackend("test-client-id").getArtistTopTracks("33333", 5);
    expect(tracks[0]).toMatchObject({
      uri: "sc:1",
      title: "Xtal",
      playbackCount: 1234567,
      likeCount: 4321,
    });
  });

  test("leaves the counts absent when SoundCloud omits them", async () => {
    stubApi({
      "/users/44444/toptracks": {
        collection: [{ id: 2, title: "Ageispolis", user: { username: "Aphex Twin" }, duration: 1000 }],
      },
    });
    const tracks = await new SoundCloudBackend("test-client-id").getArtistTopTracks("44444", 5);
    expect(tracks[0]).not.toHaveProperty("playbackCount");
    expect(tracks[0]).not.toHaveProperty("likeCount");
  });

  test("serves a repeat lookup from cache instead of re-hitting the API", async () => {
    const stub = stubApi({
      "/users/55555/toptracks": {
        collection: [{ id: 3, title: "Tha", user: { username: "Aphex Twin" }, duration: 1000 }],
      },
    });
    const backend = new SoundCloudBackend("test-client-id");
    await backend.getArtistTopTracks("55555", 5);
    await backend.getArtistTopTracks("55555", 5);
    expect(stub.paths.filter((p) => p === "/users/55555/toptracks")).toHaveLength(1);
  });
});
