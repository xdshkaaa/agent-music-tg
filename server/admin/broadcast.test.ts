import { describe, expect, test } from "bun:test";
import type { AppEnv } from "../api/context";
import type { BroadcastButton } from "./broadcast";
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "test-token";

const { Hono } = await import("hono");
const { openDb } = await import("../db");
const { getUser, upsertUser } = await import("../access/users-store");
const { createAdminRoutes } = await import("../api/admin-routes");
const { buildBroadcastKeyboard, createTelegramBroadcastSender } = await import("./telegram-broadcast");
const { __resetForTests, __setEmojiForTests } = await import("../bot/emoji");
const {
  broadcastRecipientName,
  broadcast,
  parseBroadcastButtons,
  personalizeBroadcastMessage,
  resolveBroadcastMediaKind,
  validateBroadcastMessage,
} = await import("./broadcast");

describe("broadcast message validation", () => {
  test("builds valid Web App button rows with premium icons and no empty row", () => {
    __resetForTests();
    __setEmojiForTests("app", "5870718740236079262");
    __setEmojiForTests("link", "5870527201874546272");
    expect(
      JSON.parse(JSON.stringify(buildBroadcastKeyboard([
        { kind: "preset", preset: "open_app", text: "Запустить", style: "primary" },
        { kind: "url", text: "Подробнее", url: "https://example.com/news", style: "success" },
      ], "https://miniapp.xdshka.party"))),
    ).toEqual({
      inline_keyboard: [
        [{
          text: "Запустить",
          icon_custom_emoji_id: "5870718740236079262",
          style: "primary",
          web_app: { url: "https://miniapp.xdshka.party" },
        }],
        [{
          text: "Подробнее",
          icon_custom_emoji_id: "5870527201874546272",
          style: "success",
          url: "https://example.com/news",
        }],
      ],
    });
    __resetForTests();
  });

  test("recognizes Telegram-native media types and falls back to a document", () => {
    expect(resolveBroadcastMediaKind("cover.JPG", "image/jpeg")).toBe("photo");
    expect(resolveBroadcastMediaKind("promo.GIF", "application/octet-stream")).toBe("animation");
    expect(resolveBroadcastMediaKind("clip.mp4", "video/mp4")).toBe("video");
    expect(resolveBroadcastMediaKind("clip.mov", "video/quicktime")).toBe("document");
    expect(resolveBroadcastMediaKind("poster.svg", "image/svg+xml")).toBe("document");
    expect(resolveBroadcastMediaKind("renamed.gif", "application/pdf")).toBe("document");
  });

  test("accepts legacy presets plus editable custom buttons and rejects invalid URLs", () => {
    expect(parseBroadcastButtons(["open_app", "search", "open_app", "profile"])).toEqual([
      { kind: "preset", preset: "open_app", text: "Открыть приложение" },
      { kind: "preset", preset: "search", text: "Поиск" },
      { kind: "preset", preset: "profile", text: "Профиль" },
    ]);
    expect(parseBroadcastButtons([
      { kind: "url", text: "Наш канал", url: "https://t.me/example", style: "primary" },
    ])).toEqual([
      { kind: "url", text: "Наш канал", url: "https://t.me/example", style: "primary" },
    ]);
    expect(parseBroadcastButtons([{ kind: "url", text: "Сломано", url: "javascript:alert(1)" }])).toBeNull();
    expect(parseBroadcastButtons(["open_app", "unknown"])).toBeNull();
    expect(parseBroadcastButtons("open_app")).toBeNull();
  });

  test("requires text or media and applies Telegram text limits", () => {
    expect(validateBroadcastMessage({ text: "", buttons: [] })).toBe("Добавьте текст или вложение.");
    expect(validateBroadcastMessage({ text: "x".repeat(4097), buttons: [] })).toBe(
      "Текст без вложения должен быть не длиннее 4096 символов.",
    );
    expect(
      validateBroadcastMessage({
        text: "x".repeat(1025),
        buttons: [],
        media: { kind: "photo", data: new Uint8Array([1]), filename: "a.jpg", mimeType: "image/jpeg" },
      }),
    ).toBe("Подпись к вложению должна быть не длиннее 1024 символов.");
  });

  test("applies Telegram upload limits to photos and other files", () => {
    expect(
      validateBroadcastMessage({
        text: "",
        buttons: [],
        media: { kind: "photo", data: new Uint8Array(10 * 1024 * 1024 + 1), filename: "a.jpg", mimeType: "image/jpeg" },
      }),
    ).toBe("Изображение должно быть не больше 10 МБ.");
    expect(
      validateBroadcastMessage({
        text: "",
        buttons: [],
        media: { kind: "video", data: new Uint8Array(50 * 1024 * 1024 + 1), filename: "a.mp4", mimeType: "video/mp4" },
      }),
    ).toBe("Вложение должно быть не больше 50 МБ.");
  });
});

describe("broadcast delivery", () => {
  test("chooses a first name, then @username, then a neutral fallback", () => {
    expect(broadcastRecipientName({ firstName: " Алиса ", username: "alice" })).toBe("Алиса");
    expect(broadcastRecipientName({ firstName: null, username: "alice" })).toBe("@alice");
    expect(broadcastRecipientName({ firstName: null, username: null })).toBe("друг");
  });

  test("personalizes every placeholder and escapes names in HTML messages", () => {
    const db = openDb(":memory:");
    upsertUser(db, 101, "alice", "Алиса <Admin>");
    const storedUser = getUser(db, 101)!;

    expect(personalizeBroadcastMessage(
      { text: "<b>Привет, {name}!</b> До встречи, {name}.", buttons: [], parseMode: "HTML" },
      storedUser,
    ).text).toBe("<b>Привет, Алиса &lt;Admin&gt;!</b> До встречи, Алиса &lt;Admin&gt;.");
  });

  test("uploads media once and reuses Telegram file_id for later recipients", async () => {
    const sources: unknown[] = [];
    const bot = {
      api: {
        async sendPhoto(_chatId: number, source: unknown) {
          sources.push(source);
          return { photo: [{ file_id: "small" }, { file_id: "photo-file-id" }] };
        },
      },
    } as unknown as Parameters<typeof createTelegramBroadcastSender>[0];
    const send = createTelegramBroadcastSender(bot, "https://miniapp.xdshka.party");
    const message = {
      text: "Подпись",
      buttons: [] as const,
      media: {
        kind: "photo" as const,
        data: new Uint8Array([1, 2, 3]),
        filename: "cover.jpg",
        mimeType: "image/jpeg",
      },
    };

    await send(101, message);
    await send(202, message);

    expect(typeof sources[0]).not.toBe("string");
    expect(sources[1]).toBe("photo-file-id");
  });

  test("keeps legacy bot-admin text plain while Mini App broadcasts can opt into HTML", async () => {
    const options: unknown[] = [];
    const bot = {
      api: {
        async sendMessage(_chatId: number, _text: string, sendOptions: unknown) {
          options.push(sendOptions);
          return {};
        },
      },
    } as unknown as Parameters<typeof createTelegramBroadcastSender>[0];
    const send = createTelegramBroadcastSender(bot, "https://miniapp.xdshka.party");

    await send(101, { text: "1 < 2", buttons: [] });
    await send(202, { text: "<b>Новость</b>", buttons: [], parseMode: "HTML" });

    expect(options).toEqual([
      { reply_markup: undefined },
      { parse_mode: "HTML", reply_markup: undefined },
    ]);
  });

  test("sends a personalized message to every known user and tolerates failures", async () => {
    const db = openDb(":memory:");
    upsertUser(db, 101, "alice", "Алиса");
    upsertUser(db, 202, "bob");
    const message = {
      text: "Привет, {name}!",
      buttons: [{ kind: "preset", preset: "open_app", text: "Открыть приложение" }] as const,
    };
    const calls: Array<{ chatId: number; text: string }> = [];

    const result = await broadcast(db, message, async (chatId, payload) => {
      calls.push({ chatId, text: payload.text });
      if (chatId === 202) throw new Error("blocked");
    });

    expect(result).toEqual({ sent: 1, failed: 1 });
    expect(calls).toEqual([
      { chatId: 101, text: "Привет, Алиса!" },
      { chatId: 202, text: "Привет, @bob!" },
    ]);
  });
});

describe("admin broadcast API", () => {
  test("accepts multipart media and prepared buttons", async () => {
    const db = openDb(":memory:");
    upsertUser(db, 101);
    const delivered: Array<{
      chatId: number;
      text: string;
      buttons: readonly BroadcastButton[];
      kind?: string;
      filename?: string;
    }> = [];
    const routes = createAdminRoutes(db, {
      send: async (chatId, message) => {
        delivered.push({
          chatId,
          text: message.text,
          buttons: message.buttons,
          kind: message.media?.kind,
          filename: message.media?.filename,
        });
      },
    });
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("chatId", 999);
      c.set("isAdmin", true);
      await next();
    });
    app.route("/", routes);

    const form = new FormData();
    form.set("text", "<b>Новинка</b>");
    form.set("buttons", JSON.stringify([
      { kind: "preset", preset: "open_app", text: "Запустить", style: "primary" },
      { kind: "url", text: "Подробнее", url: "https://example.com/news", style: "success" },
    ]));
    form.set("media", new File(["gif-data"], "promo.gif", { type: "image/gif" }));
    const response = await app.request("/admin/broadcast", { method: "POST", body: form });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: 1, failed: 0 });
    expect(delivered).toEqual([
      {
        chatId: 101,
        text: "<b>Новинка</b>",
        buttons: [
          { kind: "preset", preset: "open_app", text: "Запустить", style: "primary" },
          { kind: "url", text: "Подробнее", url: "https://example.com/news", style: "success" },
        ],
        kind: "animation",
        filename: "promo.gif",
      },
    ]);
  });

  test("rejects unknown button presets before delivery", async () => {
    const db = openDb(":memory:");
    upsertUser(db, 101);
    let sendCount = 0;
    const routes = createAdminRoutes(db, { send: async () => { sendCount++; } });
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("chatId", 999);
      c.set("isAdmin", true);
      await next();
    });
    app.route("/", routes);

    const response = await app.request("/admin/broadcast", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Новость", buttons: ["evil"] }),
    });

    expect(response.status).toBe(400);
    expect(sendCount).toBe(0);
  });
});
