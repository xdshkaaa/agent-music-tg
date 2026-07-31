import { Hono } from "hono";
import { run } from "@grammyjs/runner";
import { env } from "./env";
import { openDb } from "./db";
import { bootstrapAllowlist } from "./lib/access-control";
import { createBot } from "./bot";
import { loadCustomEmojis } from "./bot/emoji";
import { statusMessage } from "./bot/message-format";
import { createApiRoutes } from "./api/routes";
import { setVerificationExtractor, setPrewarmStreamResolver } from "./core/run-generation";
import { verifyWebhookSignature, type WebhookUpdate } from "./payments/webhook";
import { fulfillInvoice, fulfillPendingInvoice, type FulfillResult } from "./payments/fulfillment";
import { startPoller, startPlategaPoller } from "./payments/poller";
import { verifyPlategaCallback, type PlategaWebhookBody } from "./payments/platega";
import { getInvoice } from "./payments/invoices-store";
import { cancelInvoiceAndRefund } from "./payments/cancel";
import { alertPaymentFulfilled } from "./payments/alerts";
import { createRuntimeAudioDeps, runtimeExtractor, runtimeStreamResolver } from "./audio/runtime";
import type { AudioDeps } from "./api/audio-routes";
import { reconcileStaleDownloads } from "./audio/downloads-store";
import { createTelegramBroadcastSender } from "./admin/telegram-broadcast";
import { createShutdownHandler } from "./lifecycle";
import { prewarmMusicProviders } from "./music/registry";

const db = openDb(env.dbPath);
bootstrapAllowlist(db);

// Finalize any download rows left mid-job by a previous process (crash or
// restart) so they can't wedge the active-download lock for that chat.
reconcileStaleDownloads(db);

// Long-polling, not a webhook: no public route needed for the bot itself,
// only the Mini App + its API (see design.md — matches this VPS's existing
// fox-nails-bot convention). Runs concurrently with the HTTP server below.
const bot = createBot(db);

// Best-effort: prime the premium-emoji map before the first update arrives.
// When emoji-symbols.json is empty or the fetch fails, the map stays empty
// and bot replies fall back to clean text. See server/bot/emoji.ts.
void loadCustomEmojis(bot);

// Best-effort: warm both music backends' lazy session/client_id init so the
// first real generation isn't the one paying that latency.
prewarmMusicProviders();

const send = createTelegramBroadcastSender(bot, env.publicOrigin);

async function notifyFulfilled(result: FulfillResult): Promise<void> {
  await alertPaymentFulfilled(db, result);
  if (!result.fulfilled || !result.chatId || !result.offerTitle) return;
  try {
    await bot.api.sendMessage(
      result.chatId,
      statusMessage("check", "Оплата получена", `Пакет «${result.offerTitle}» активирован.`),
      { parse_mode: "HTML" },
    );
  } catch {
    // user may have blocked the bot — ignore
  }
}

const app = new Hono();

app.get("/healthz", (c) => c.json({ ok: true }));

// Crypto Pay webhook — MUST be registered before the requireAuth-protected
// /api routes; Crypto Pay does not carry our Mini App initData auth.
app.post("/api/crypto/webhook", async (c) => {
  const raw = await c.req.text();
  const signature = c.req.header("crypto-pay-api-signature");
  if (!verifyWebhookSignature(raw, signature)) {
    return c.json({ error: "invalid signature" }, 401);
  }
  let update: WebhookUpdate;
  try {
    update = JSON.parse(raw) as WebhookUpdate;
  } catch {
    return c.json({ error: "invalid body" }, 400);
  }
  const invoiceId = update.payload?.invoice_id;
  if (update.update_type === "invoice_paid" && typeof invoiceId === "number") {
    const result = fulfillInvoice(db, invoiceId);
    await notifyFulfilled(result);
  }
  return c.json({ ok: true });
});

// Platega webhook — MUST be registered before the requireAuth-protected /api
// routes; Platega does not carry our Mini App initData auth. Always responds
// 200 once authenticated (per Platega retry semantics).
app.post("/api/platega/webhook", async (c) => {
  const merchantId = c.req.header("x-merchantid");
  const secret = c.req.header("x-secret");
  if (!verifyPlategaCallback(merchantId, secret)) {
    return c.json({ error: "invalid signature" }, 401);
  }
  let body: PlategaWebhookBody;
  try {
    body = (await c.req.json()) as PlategaWebhookBody;
  } catch {
    return c.json({ error: "invalid body" }, 400);
  }
  const id = body.id;
  if (!id) return c.json({ ok: true });

  if (body.status === "CONFIRMED") {
    const invoice = getInvoice(db, "platega", id);
    if (!invoice) {
      console.error("[platega webhook] unknown transaction", id);
      return c.json({ ok: true });
    }
    if (Number(invoice.amount) !== Number(body.amount) || (body.currency ?? "RUB") !== "RUB") {
      console.error("[platega webhook] amount/currency mismatch", id, invoice.amount, body.amount, body.currency);
      return c.json({ ok: true });
    }
    const result = fulfillPendingInvoice(db, "platega", id);
    await notifyFulfilled(result);
  } else if (body.status === "CANCELED") {
    cancelInvoiceAndRefund(db, "platega", id);
  } else if (body.status === "CHARGEBACKED") {
    const result = cancelInvoiceAndRefund(db, "platega", id);
    if (!result.canceled) {
      const invoice = getInvoice(db, "platega", id);
      console.error("[platega webhook] chargeback on already-paid transaction", id);
      await alertPaymentFulfilled(db, {
        fulfilled: true,
        chatId: invoice?.chatId,
        provider: "platega",
        amount: invoice?.amount,
        asset: invoice?.asset,
        offerTitle: `⚠️ ЧАРДЖБЭК по транзакции ${id}`,
      });
    }
  }
  return c.json({ ok: true });
});

// Stars invoice links for the Mini App: Bot API createInvoiceLink with the XTR
// currency takes an empty provider_token (Telegram-native payments).
// Bot API returns https://telegram.me/$... but WebApp.openInvoice only accepts
// t.me invoice URLs (throws WebAppInvoiceUrlInvalid otherwise) — normalize.
const createStarsInvoiceLink = async (args: { title: string; description: string; payload: string; starsAmount: number }) => {
  const link = await bot.api.createInvoiceLink(args.title, args.description, args.payload, "", "XTR", [
    { label: args.title, amount: args.starsAmount },
  ]);
  return link.replace(/^https:\/\/telegram\.me\//, "https://t.me/");
};

setVerificationExtractor(runtimeExtractor);
const audio: AudioDeps = {
  ...createRuntimeAudioDeps(bot.api),
  streamResolver: runtimeStreamResolver,
};
if (env.audioStorageChatId === null) {
  console.warn("[audio warm] AUDIO_STORAGE_CHAT_ID is not configured; background cache warming is disabled");
}
// Resolve upstream URLs after generation so first playback skips yt-dlp startup too.
setPrewarmStreamResolver(runtimeStreamResolver);

app.route("/api", createApiRoutes(db, { send, createStarsInvoiceLink, audio, getChatMember: (channelId, chatId) => bot.api.getChatMember(channelId, chatId) }));

// grammY's built-in polling awaits each update's full middleware chain before
// touching the next one, so a single 30-120s generation froze every other
// user's taps (and could push pre_checkout_query past Telegram's 10s deadline).
// The runner processes updates concurrently; sequentialize() in createBot keeps
// per-chat ordering intact. The concurrency cap is a pile-up backstop — the
// library default of 500 in-flight updates would let a burst spawn far more
// simultaneous agent runs than this box should carry.
const runner = run(bot, { sink: { concurrency: 64 } });

const stopPoller = startPoller(db, notifyFulfilled);
const stopPlategaPoller = startPlategaPoller(db, notifyFulfilled);
const shutdown = createShutdownHandler({
  stopPoller,
  stopPlategaPoller,
  // Resolves once in-flight middleware finishes, so a systemd restart doesn't
  // cut a generation mid-run any earlier than the shutdown budget allows.
  stopBot: () => runner.stop(),
  exit: (code) => process.exit(code),
});
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

export default {
  port: env.port,
  fetch: app.fetch,
  // AI generation streams (SSE) can go >10s between events; Bun's default
  // idleTimeout (10s) kills the socket mid-stream otherwise, surfacing as
  // "Load failed" on the client.
  idleTimeout: 255,
};
