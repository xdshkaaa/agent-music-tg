import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token";

const { isAnimatedAvatar, convertToStaticJpeg, getCachedAvatarRelPath, AVATAR_DIR } = await import("./avatar");

const ffmpegAvailable = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { timeout: 3000, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
})();

describe("isAnimatedAvatar", () => {
  test("detects .mp4 as animated", () => {
    expect(isAnimatedAvatar("videos/avatar.mp4")).toBe(true);
  });

  test("detects .mov as animated", () => {
    expect(isAnimatedAvatar("videos/avatar.mov")).toBe(true);
  });

  test("detects .gif as animated", () => {
    expect(isAnimatedAvatar("images/avatar.gif")).toBe(true);
  });

  test("returns false for .jpg", () => {
    expect(isAnimatedAvatar("images/avatar.jpg")).toBe(false);
  });

  test("returns false for .jpeg", () => {
    expect(isAnimatedAvatar("images/avatar.jpeg")).toBe(false);
  });

  test("returns false for .png", () => {
    expect(isAnimatedAvatar("images/avatar.png")).toBe(false);
  });

  test("is case-insensitive", () => {
    expect(isAnimatedAvatar("avatar.MP4")).toBe(true);
    expect(isAnimatedAvatar("avatar.MOV")).toBe(true);
    expect(isAnimatedAvatar("avatar.GIF")).toBe(true);
  });
});

describe("convertToStaticJpeg", () => {
  const testDir = path.join(AVATAR_DIR, ".test");
  const itIf = ffmpegAvailable ? test : test.skip;

  function createTestMp4(name: string): string {
    const p = path.join(testDir, name);
    execFileSync("ffmpeg", [
      "-f", "lavfi",
      "-i", "color=c=red:s=32x32:d=1",
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-y",
      p,
    ], { timeout: 10000, stdio: "pipe" });
    return p;
  }

  beforeAll(() => {
    if (!ffmpegAvailable) return;
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    try { rmSync(testDir, { recursive: true, force: true }); } catch {}
  });

  test("returns null when input file does not exist", async () => {
    const result = await convertToStaticJpeg("/nonexistent/file.mp4", "test-nonexistent-id");
    expect(result).toBeNull();
  });

  itIf("converts MP4 first frame to JPEG", async () => {
    const mp4 = createTestMp4("input-convert.mp4");
    const result = await convertToStaticJpeg(mp4, "test-convert-id");
    expect(result).not.toBeNull();
    expect(existsSync(result!)).toBe(true);

    const buf = await import("node:fs/promises").then((m) => m.readFile(result!));
    expect(buf[0]).toBe(0xff);
    expect(buf[1]).toBe(0xd8);

    try { unlinkSync(result!); } catch {}
  });

  itIf("uses cached result on second call", async () => {
    // First call gets a fresh MP4 copy; convertToStaticJpeg deletes it.
    const mp4a = createTestMp4("input-cache-a.mp4");
    const result1 = await convertToStaticJpeg(mp4a, "test-cache-id");
    expect(result1).not.toBeNull();

    // Second call with a different MP4 — should find the cached JPEG
    // from the first call and return it without re-running ffmpeg.
    const mp4b = createTestMp4("input-cache-b.mp4");
    const result2 = await convertToStaticJpeg(mp4b, "test-cache-id");
    expect(result2).not.toBeNull();
    expect(result2).toBe(result1);

    try { if (result1) unlinkSync(result1); } catch {}
    try { unlinkSync(mp4b); } catch {}
  });
});

describe("getCachedAvatarRelPath", () => {
  test("returns null for unknown id", () => {
    expect(getCachedAvatarRelPath("nonexistent-id-12345")).toBeNull();
  });
});

describe("GET /api/avatar/:filename", () => {
  beforeAll(() => {
    if (!existsSync(AVATAR_DIR)) mkdirSync(AVATAR_DIR, { recursive: true });
    // Create a minimal valid JPEG for testing
    // Minimal JPEG file (2x2 pixel)
    const minimalJpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
      0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
      0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
      0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
      0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
      0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
      0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
      0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
      0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
      0x09, 0x0a, 0x0b, 0xff, 0xc4, 0x00, 0xb5, 0x10, 0x00, 0x02, 0x01, 0x03,
      0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x00, 0x00,
      0x01, 0x7d, 0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31,
      0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91,
      0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33,
      0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26,
      0x27, 0x28, 0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43,
      0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57,
      0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73,
      0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87,
      0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a,
      0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4,
      0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7,
      0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
      0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2,
      0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa, 0xff, 0xda, 0x00, 0x08,
      0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x7a, 0xfe, 0x7f, 0x3f, 0xff, 0xd9,
    ]);
    writeFileSync(path.join(AVATAR_DIR, "test-avatar.jpg"), minimalJpeg);
  });

  afterAll(() => {
    try { unlinkSync(path.join(AVATAR_DIR, "test-avatar.jpg")); } catch {}
  });

  test("returns 200 and JPEG for existing file", async () => {
    const { createApiRoutes } = await import("./api/routes");
    const { openDb } = await import("./db");
    const db = openDb(":memory:");
    db.run("INSERT INTO allowlist (chat_id, is_admin) VALUES (?, 0)", [99999]);
    const app = createApiRoutes(db);

    const res = await app.request("/avatar/test-avatar.jpg", {
      headers: { "X-Telegram-Init-Data": buildInitData(99999) },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
  });

  test("rejects path traversal", async () => {
    const { createApiRoutes } = await import("./api/routes");
    const { openDb } = await import("./db");
    const db = openDb(":memory:");
    db.run("INSERT INTO allowlist (chat_id, is_admin) VALUES (?, 0)", [99999]);
    const app = createApiRoutes(db);

    const res = await app.request("/avatar/../../etc/passwd", {
      headers: { "X-Telegram-Init-Data": buildInitData(99999) },
    });
    expect(res.status).toBe(404);
  });

  test("returns 404 for missing file", async () => {
    const { createApiRoutes } = await import("./api/routes");
    const { openDb } = await import("./db");
    const db = openDb(":memory:");
    db.run("INSERT INTO allowlist (chat_id, is_admin) VALUES (?, 0)", [99999]);
    const app = createApiRoutes(db);

    const res = await app.request("/avatar/nonexistent.jpg", {
      headers: { "X-Telegram-Init-Data": buildInitData(99999) },
    });
    expect(res.status).toBe(404);
  });
});

function buildInitData(chatId: number): string {
  const { createHmac } = require("node:crypto");
  const params = new URLSearchParams();
  params.set("auth_date", String(Math.floor(Date.now() / 1000)));
  params.set("user", JSON.stringify({ id: chatId, first_name: "Test" }));
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update("test-token").digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}
