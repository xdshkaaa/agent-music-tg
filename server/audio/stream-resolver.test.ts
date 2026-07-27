import { expect, test } from "bun:test";
import { chmodSync, mkdtempSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { YtDlpStreamResolver } from "./stream-resolver";

test("resolves a playable upstream URL once and reuses it from memory", async () => {
  const dir = mkdtempSync(join(tmpdir(), "stream-resolver-"));
  const binary = join(dir, "fake-yt-dlp");
  const callsFile = join(dir, "calls");
  await writeFile(callsFile, "");
  await writeFile(
    binary,
    `#!/bin/sh
printf x >> "${callsFile}"
printf '%s' '{"url":"https://media.example/fallback","http_headers":{"User-Agent":"fallback"},"requested_downloads":[{"url":"https://media.example/audio.m4a?expire=4102444800","http_headers":{"User-Agent":"resolver-test","Referer":"https://music.youtube.com/"}}]}'
`,
  );
  chmodSync(binary, 0o755);
  const resolver = new YtDlpStreamResolver({ binary, ttlMs: 60_000 });

  const first = await resolver.resolve("ytm:abc");
  const second = await resolver.resolve("ytm:abc");

  expect(first).toEqual({
    url: "https://media.example/audio.m4a?expire=4102444800",
    headers: { "User-Agent": "resolver-test", Referer: "https://music.youtube.com/" },
  });
  expect(second).toEqual(first);
  expect(await readFile(callsFile, "utf8")).toBe("x");
});

test("asks yt-dlp for progressive HTTP audio instead of an HLS manifest", async () => {
  const dir = mkdtempSync(join(tmpdir(), "stream-resolver-progressive-"));
  const binary = join(dir, "fake-yt-dlp");
  const argsFile = join(dir, "args");
  await writeFile(
    binary,
    `#!/bin/sh
printf '%s' "$*" > "${argsFile}"
printf '%s' '{"requested_downloads":[{"url":"https://media.example/audio.mp3","protocol":"http","http_headers":{}}]}'
`,
  );
  chmodSync(binary, 0o755);
  const resolver = new YtDlpStreamResolver({ binary });

  const stream = await resolver.resolve("sc:293");

  expect(stream.url).toBe("https://media.example/audio.mp3");
  const args = await readFile(argsFile, "utf8");
  expect(args).toContain("bestaudio[ext=m4a][protocol^=http][protocol!*=m3u8]");
  expect(args).toContain("bestaudio[protocol^=http][protocol!*=m3u8]");
});

/** A fake yt-dlp that answers with `url` and tallies how often it was spawned. */
async function fakeResolver(label: string, url: string, ttlMs?: number) {
  const dir = mkdtempSync(join(tmpdir(), `stream-resolver-${label}-`));
  const binary = join(dir, "fake-yt-dlp");
  const callsFile = join(dir, "calls");
  await writeFile(callsFile, "");
  await writeFile(
    binary,
    `#!/bin/sh
printf x >> "${callsFile}"
printf '%s' '{"requested_downloads":[{"url":"${url}","http_headers":{}}]}'
`,
  );
  chmodSync(binary, 0o755);
  return {
    resolver: new YtDlpStreamResolver({ binary, ...(ttlMs === undefined ? {} : { ttlMs }) }),
    spawns: async () => (await readFile(callsFile, "utf8")).length,
  };
}

function expiringIn(seconds: number): string {
  return `https://media.example/audio.m4a?expire=${Math.floor(Date.now() / 1000) + seconds}`;
}

const tick = () => new Promise((r) => setTimeout(r, 5));

// ttlMs is deliberately 1ms here: a URL that states its own multi-hour lifetime
// must outlive the fallback ttl. Re-resolving a still-valid URL costs a yt-dlp
// spawn mid-playback and takes a slot from another listener's first tap.
test("keeps a resolved URL for its own stated expiry, not the fallback ttl", async () => {
  const { resolver, spawns } = await fakeResolver("expiry", expiringIn(6 * 3600), 1);

  await resolver.resolve("ytm:abc");
  await tick();

  expect(resolver.isCached("ytm:abc")).toBe(true);
  await resolver.resolve("ytm:abc");
  expect(await spawns()).toBe(1);
});

test("falls back to the ttl when the URL states no expiry", async () => {
  const { resolver, spawns } = await fakeResolver("no-expiry", "https://media.example/audio.m4a", 1);

  await resolver.resolve("ytm:abc");
  await tick();

  expect(resolver.isCached("ytm:abc")).toBe(false);
  await resolver.resolve("ytm:abc");
  expect(await spawns()).toBe(2);
});

test("an already-expired upstream URL is not held past the ttl", async () => {
  const { resolver } = await fakeResolver("stale", expiringIn(-3600), 1);

  await resolver.resolve("ytm:abc");
  await tick();

  expect(resolver.isCached("ytm:abc")).toBe(false);
});

test("isCached reports whether a resolve would spawn yt-dlp", async () => {
  const { resolver } = await fakeResolver("is-cached", expiringIn(6 * 3600));

  expect(resolver.isCached("ytm:abc")).toBe(false);
  await resolver.resolve("ytm:abc");
  expect(resolver.isCached("ytm:abc")).toBe(true);
  resolver.invalidate("ytm:abc");
  expect(resolver.isCached("ytm:abc")).toBe(false);
});

test("concurrent resolves of one uri share a single yt-dlp spawn", async () => {
  const { resolver, spawns } = await fakeResolver("inflight", expiringIn(6 * 3600));

  await Promise.all([resolver.resolve("ytm:abc"), resolver.resolve("ytm:abc"), resolver.resolve("ytm:abc")]);

  expect(await spawns()).toBe(1);
});
