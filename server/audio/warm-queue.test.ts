import { beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { writeFile } from "node:fs/promises";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token";

const { openDb } = await import("../db");
const { getCachedAudio } = await import("./cache");
const { fileNameForUri } = await import("./extractor");
const {
  enqueueWarmTracks,
  __drainWarmQueueForTests,
  __resetWarmQueueForTests,
} = await import("./warm-queue");

import type { DeliverDeps } from "./deliver";

beforeEach(() => __resetWarmQueueForTests());

describe("audio warm queue", () => {
  test("deduplicates tracks and warms them one at a time", async () => {
    const db = openDb(":memory:");
    const calls: string[] = [];
    let active = 0;
    let maxActive = 0;
    const dir = mkdtempSync(join(tmpdir(), "warm-queue-"));
    const deps: DeliverDeps = {
      scratchDir: dir,
      extractor: {
        async extract(uri, targetDir) {
          calls.push(uri);
          active++;
          maxActive = Math.max(maxActive, active);
          await new Promise((resolve) => setTimeout(resolve, 2));
          const filePath = join(targetDir, fileNameForUri(uri));
          await writeFile(filePath, "audio");
          active--;
          return { filePath, sizeBytes: 5 };
        },
        async probe() { return { available: true }; },
      },
      sender: {
        async sendAudioByFileId() {},
        async sendAudioFile(_chatId, _filePath, meta) { return `cached-${meta.title}`; },
        async sendText() {},
      },
    };
    const tracks = [
      { uri: "ytm:a", title: "A", artist: "Artist" },
      { uri: "ytm:b", title: "B", artist: "Artist" },
    ];

    enqueueWarmTracks(db, tracks, deps, -1001, 2);
    enqueueWarmTracks(db, tracks, deps, -1001, 2);
    await __drainWarmQueueForTests();

    expect(calls).toEqual(["ytm:a", "ytm:b"]);
    expect(maxActive).toBe(1);
    expect(getCachedAudio(db, "ytm:a")?.tgFileId).toBe("cached-A");
    expect(getCachedAudio(db, "ytm:b")?.tgFileId).toBe("cached-B");
  });

  test("does nothing without a storage channel", async () => {
    const db = openDb(":memory:");
    let calls = 0;
    const deps = {
      scratchDir: "/unused",
      extractor: { async extract() { calls++; throw new Error("unused"); }, async probe() { return { available: true }; } },
      sender: { async sendAudioByFileId() {}, async sendAudioFile() { return "unused"; }, async sendText() {} },
    } satisfies DeliverDeps;

    enqueueWarmTracks(db, [{ uri: "ytm:a", title: "A", artist: "Artist" }], deps, null);
    await __drainWarmQueueForTests();
    expect(calls).toBe(0);
  });
});
