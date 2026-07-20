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
