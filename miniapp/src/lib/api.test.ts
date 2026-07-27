import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { api, PlaylistLimitReachedError, streamUrl } from "./api";
import type { AgentEvent } from "./reasoning";

const INIT_DATA = "user=%7B%22id%22%3A1%7D&hash=abc";

interface Call {
  url: string;
  init: RequestInit;
}

let calls: Call[] = [];
let respond: (call: Call) => Response;
const realFetch = globalThis.fetch;

/** Builds a JSON Response the way the server would. */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Concatenates SSE frames into a streaming text/event-stream Response. */
function sse(frames: unknown[]): Response {
  const body = frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join("");
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

function headerOf(call: Call, name: string): string | null {
  return new Headers(call.init.headers as HeadersInit).get(name);
}

beforeEach(() => {
  calls = [];
  respond = () => json({ ok: true });
  // api.ts reads initData off window.Telegram.WebApp via getInitData().
  (globalThis as { window?: unknown }).window = { Telegram: { WebApp: { initData: INIT_DATA } } };
  globalThis.fetch = ((url: string, init: RequestInit = {}) => {
    const call = { url, init };
    calls.push(call);
    return Promise.resolve(respond(call));
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete (globalThis as { window?: unknown }).window;
});

describe("request envelope", () => {
  test("signs every call with the Telegram initData header", async () => {
    respond = () => json({ chatId: 1 });
    await api.me();
    expect(calls[0]!.url).toBe("/api/me");
    expect(headerOf(calls[0]!, "X-Telegram-Init-Data")).toBe(INIT_DATA);
    expect(headerOf(calls[0]!, "content-type")).toBe("application/json");
  });

  test("omits content-type for FormData so the browser sets the multipart boundary", async () => {
    respond = () => json({ sent: 1, failed: 0 });
    await api.adminBroadcast({ text: "hi", buttons: [], media: null });
    expect(headerOf(calls[0]!, "content-type")).toBeNull();
    expect(calls[0]!.init.body).toBeInstanceOf(FormData);
    const body = calls[0]!.init.body as FormData;
    expect(body.get("text")).toBe("hi");
    expect(body.get("buttons")).toBe("[]");
    expect(body.get("media")).toBeNull();
  });

  test("surfaces the server's error message rather than the status code", async () => {
    respond = () => json({ error: "нет доступа" }, 403);
    await expect(api.me()).rejects.toThrow("нет доступа");
  });

  test("falls back to the status code when the error body is not JSON", async () => {
    respond = () => new Response("<html>502</html>", { status: 502 });
    await expect(api.me()).rejects.toThrow("request failed: 502");
  });
});

describe("URL building", () => {
  test("percent-encodes user input in query strings", async () => {
    respond = () => json({ tracks: [], artists: [] });
    await api.search("drum & bass", 5);
    expect(calls[0]!.url).toBe("/api/search?q=drum%20%26%20bass&limit=5");
  });

  test("percent-encodes track URIs in path segments", async () => {
    await api.removeMyMusic("yt:track/a b#c");
    expect(calls[0]!.url).toBe("/api/my-music/yt%3Atrack%2Fa%20b%23c");
    expect(calls[0]!.init.method).toBe("DELETE");
  });

  test("sends only the artist query fields that are set", async () => {
    respond = () => json({ id: "1", name: "X", topTracks: [], albums: [] });
    await api.artist({ name: "Boards of Canada" });
    expect(calls[0]!.url).toBe("/api/artist?name=Boards+of+Canada");
  });

  test("omits the lyrics duration hint when it is absent or zero", async () => {
    respond = () => json({ status: "notFound" });
    await api.lyrics("A", "B");
    expect(calls[0]!.url).toBe("/api/lyrics?artist=A&title=B");
    await api.lyrics("A", "B", 201.6);
    expect(calls[1]!.url).toBe("/api/lyrics?artist=A&title=B&duration=202");
  });

  test("streamUrl carries initData in the query string for <audio src>", () => {
    expect(streamUrl("yt:track/x y")).toBe(
      `/api/stream/yt%3Atrack%2Fx%20y?initData=${encodeURIComponent(INIT_DATA)}`,
    );
  });
});

describe("download payload", () => {
  test("strips fields the download endpoint does not accept", async () => {
    respond = () => json({ downloadId: 7 });
    await api.download("Ночь", [
      {
        uri: "u1",
        title: "T",
        artist: "A",
        durationMs: 1000,
        artwork: "art",
        album: "Album",
        deepLink: "https://example.com",
      },
    ]);
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.playlistName).toBe("Ночь");
    expect(body.tracks[0]).toEqual({ uri: "u1", title: "T", artist: "A", durationMs: 1000, artwork: "art" });
  });
});

describe("createPlaylist", () => {
  test("turns a 403 into PlaylistLimitReachedError with the upsell details", async () => {
    respond = () => json({ limit: 3, starsPrice: 25 }, 403);
    const err = await api.createPlaylist("Новый").catch((e) => e);
    expect(err).toBeInstanceOf(PlaylistLimitReachedError);
    expect(err.limit).toBe(3);
    expect(err.starsPrice).toBe(25);
  });

  test("defaults the limit and price when the 403 body is empty", async () => {
    respond = () => new Response("", { status: 403 });
    const err = (await api.createPlaylist("Новый").catch((e) => e)) as PlaylistLimitReachedError;
    expect(err).toBeInstanceOf(PlaylistLimitReachedError);
    expect(err.limit).toBe(2);
    expect(err.starsPrice).toBe(5);
  });

  test("other failures stay generic errors", async () => {
    respond = () => json({ error: "boom" }, 500);
    const err = await api.createPlaylist("Новый").catch((e) => e);
    expect(err).not.toBeInstanceOf(PlaylistLimitReachedError);
    expect(err.message).toBe("boom");
  });
});

describe("generateStream (SSE)", () => {
  test("dispatches agent events and resolves with the outcome frame", async () => {
    const outcome = { status: "ok", playlist: { name: "P", tracks: [] }, generationId: 3 };
    respond = () =>
      sse([
        { type: "agent_event", event: { kind: "reasoning", delta: "думаю" } },
        { type: "agent_event", event: { kind: "tool_call", id: "t1", name: "searchTrack", args: {} } },
        { type: "outcome", outcome },
      ]);
    const seen: AgentEvent[] = [];
    const result = await api.generateStream("грустный вечер", (e) => seen.push(e));
    expect(seen).toHaveLength(2);
    expect(result).toEqual(outcome as never);
    expect(calls[0]!.url).toBe("/api/generate/stream");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ prompt: "грустный вечер" });
  });

  test("reassembles frames split across chunk boundaries", async () => {
    const chunks = [
      'data: {"type":"agent_event","event":{"kind":"reasoning","de',
      'lta":"частями"}}\n\n data: ignored',
      '\ndata: {"type":"outcome","outcome":{"status":"needs_purchase"}}\n\n',
    ];
    respond = () =>
      new Response(
        new ReadableStream({
          start(controller) {
            const enc = new TextEncoder();
            for (const c of chunks) controller.enqueue(enc.encode(c));
            controller.close();
          },
        }),
      );
    const seen: AgentEvent[] = [];
    const result = await api.generateStream("p", (e) => seen.push(e));
    expect(seen).toEqual([{ kind: "reasoning", delta: "частями" }]);
    expect(result).toEqual({ status: "needs_purchase" });
  });

  test("rejects with the server error before reading the stream", async () => {
    respond = () => json({ error: "rate limited" }, 429);
    await expect(api.generateStream("p", () => {})).rejects.toThrow("rate limited");
  });

  test("rejects when the stream ends without an outcome", async () => {
    respond = () => sse([{ type: "agent_event", event: { kind: "reasoning", delta: "x" } }]);
    await expect(api.generateStream("p", () => {})).rejects.toThrow("stream ended without an outcome");
  });
});

describe("musicFeedback", () => {
  test("swallows failures so playback is never interrupted", async () => {
    respond = () => json({ error: "nope" }, 500);
    expect(api.musicFeedback("play_started", { uri: "u", title: "T", artist: "A" })).toBeUndefined();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls[0]!.url).toBe("/api/music-feedback");
  });
});
