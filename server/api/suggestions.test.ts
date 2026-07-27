import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token";
const TEST_CHAT = 777001;
const OTHER_CHAT = 777002;

const { env } = await import("../env");
const { openDb } = await import("../db");
const { upsertUser } = await import("../access/users-store");
const { createApiRoutes } = await import("./routes");
const { insertGeneration } = await import("../access/generations-store");
const { addSavedTrack } = await import("../access/saved-tracks-store");
const { createPlaylist, addTrackToPlaylist } = await import("../access/playlists-store");

function authHeaders(chatId: number): Record<string, string> {
  const params = new URLSearchParams();
  params.set("auth_date", String(Math.floor(Date.now() / 1000)));
  params.set("user", JSON.stringify({ id: chatId, first_name: "Test" }));
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(env.telegramBotToken).digest();
  params.set("hash", createHmac("sha256", secretKey).update(dataCheckString).digest("hex"));
  return { "X-Telegram-Init-Data": params.toString(), "content-type": "application/json" };
}

function freshDb() {
  const db = openDb(":memory:");
  for (const chat of [TEST_CHAT, OTHER_CHAT]) {
    db.run("INSERT INTO allowlist (chat_id, is_admin) VALUES (?, 0)", [chat]);
    upsertUser(db, chat);
  }
  return db;
}

interface SuggestionsBody {
  recentGenerations: { id: number; prompt: string; tracks: { uri: string }[] }[];
  topArtists: { name: string; artwork: string | null }[];
  libraryTracks: { uri: string; title: string }[];
  genres: string[];
}

async function fetchSuggestions(db: ReturnType<typeof freshDb>, chatId = TEST_CHAT) {
  const app = createApiRoutes(db, {});
  const res = await app.request("/suggestions", { headers: authHeaders(chatId) });
  expect(res.status).toBe(200);
  return (await res.json()) as SuggestionsBody;
}

describe("GET /api/suggestions", () => {
  test("a brand new user still gets genre chips to start from", async () => {
    const body = await fetchSuggestions(freshDb());
    expect(body.recentGenerations).toEqual([]);
    expect(body.topArtists).toEqual([]);
    expect(body.libraryTracks).toEqual([]);
    // The whole point of the fallback: the screen is never empty.
    expect(body.genres.length).toBe(16);
    expect(body.genres[0]).toBe("Поп");
  });

  test("returns recent generations newest first, with their tracks", async () => {
    const db = freshDb();
    insertGeneration(db, TEST_CHAT, "старый", "Старый", 1, [{ uri: "ytm:a", title: "A", artist: "X" }]);
    insertGeneration(db, TEST_CHAT, "новый", "Новый", 1, [{ uri: "ytm:b", title: "B", artist: "Y" }]);
    const body = await fetchSuggestions(db);
    expect(body.recentGenerations.map((g) => g.prompt)).toEqual(["новый", "старый"]);
    expect(body.recentGenerations[0]!.tracks[0]!.uri).toBe("ytm:b");
  });

  test("includes unsaved generations, unlike /history", async () => {
    const db = freshDb();
    insertGeneration(db, TEST_CHAT, "не сохранён", null, 1, [{ uri: "ytm:c", title: "C", artist: "Z" }]);
    const app = createApiRoutes(db, {});
    const history = await app.request("/history", { headers: authHeaders(TEST_CHAT) });
    expect(((await history.json()) as { history: unknown[] }).history).toEqual([]);
    expect((await fetchSuggestions(db)).recentGenerations).toHaveLength(1);
  });

  test("ranks playlist artists above merely saved ones", async () => {
    const db = freshDb();
    addSavedTrack(db, TEST_CHAT, { uri: "ytm:s1", title: "S", artist: "Saved Only", artwork: null });
    const playlist = createPlaylist(db, TEST_CHAT, "Мой");
    addTrackToPlaylist(db, TEST_CHAT, playlist.id, {
      uri: "ytm:p1",
      title: "P",
      artist: "Playlisted",
      artwork: "http://img/p.jpg",
    });
    const body = await fetchSuggestions(db);
    expect(body.topArtists.map((a) => a.name)).toEqual(["Playlisted", "Saved Only"]);
    expect(body.topArtists[0]!.artwork).toBe("http://img/p.jpg");
  });

  test("library tracks deduplicate a track saved and playlisted at once", async () => {
    const db = freshDb();
    addSavedTrack(db, TEST_CHAT, { uri: "ytm:dup", title: "Dup", artist: "A", artwork: null });
    const playlist = createPlaylist(db, TEST_CHAT, "Мой");
    addTrackToPlaylist(db, TEST_CHAT, playlist.id, { uri: "ytm:dup", title: "Dup", artist: "A", artwork: null });
    expect((await fetchSuggestions(db)).libraryTracks).toHaveLength(1);
  });

  test("never mixes another chat's library into the response", async () => {
    const db = freshDb();
    insertGeneration(db, OTHER_CHAT, "чужой", "Чужой", 1, [{ uri: "ytm:x", title: "X", artist: "Other" }]);
    addSavedTrack(db, OTHER_CHAT, { uri: "ytm:y", title: "Y", artist: "Other Artist", artwork: null });
    const body = await fetchSuggestions(db);
    expect(body.recentGenerations).toEqual([]);
    expect(body.topArtists).toEqual([]);
    expect(body.libraryTracks).toEqual([]);
  });

  test("requires authentication", async () => {
    const res = await createApiRoutes(freshDb(), {}).request("/suggestions");
    expect(res.status).toBe(401);
  });
});
