import { Hono } from "hono";
import { env } from "./env";
import { openDb } from "./db";
import { bootstrapAllowlist } from "./lib/access-control";
import { createBot } from "./bot";
import { loadCustomEmojis, accent } from "./bot/emoji";
import { createApiRoutes } from "./api/routes";
import { setVerificationExtractor, setPrewarmStreamCache } from "./core/run-generation";
import { verifyWebhookSignature, type WebhookUpdate } from "./payments/webhook";
import { fulfillInvoice, fulfillPendingInvoice, type FulfillResult } from "./payments/fulfillment";
import { startPoller, startPlategaPoller } from "./payments/poller";
import { verifyPlategaCallback, type PlategaWebhookBody } from "./payments/platega";
import { markCanceled, getInvoice } from "./payments/invoices-store";
import { alertPaymentFulfilled } from "./payments/alerts";
import { YtDlpExtractor } from "./audio/extractor";
import { StreamCache } from "./audio/stream-cache";
import { createTelegramAudioSender } from "./audio/telegram-sender";
import type { AudioDeps } from "./api/audio-routes";
import { reconcileStaleDownloads } from "./audio/downloads-store";

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

const send = async (chatId: number, text: string): Promise<void> => {
  await bot.api.sendMessage(chatId, text, { parse_mode: "HTML" });
};

async function notifyFulfilled(result: FulfillResult): Promise<void> {
  await alertPaymentFulfilled(db, result);
  if (!result.fulfilled || !result.chatId || !result.offerTitle) return;
  const check = accent("check");
  try {
    await send(result.chatId, `${check ? check + " " : ""}Оплата получена: «${result.offerTitle}». Доступ активирован.`);
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
    markCanceled(db, "platega", id);
  } else if (body.status === "CHARGEBACKED") {
    const canceled = markCanceled(db, "platega", id);
    if (!canceled) {
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

const extractor = new YtDlpExtractor();
setVerificationExtractor(extractor);
const audio: AudioDeps = {
  sender: createTelegramAudioSender(bot.api),
  extractor,
  scratchDir: env.audioScratchDir,
  streamCache: new StreamCache(extractor, {
    dir: env.streamCacheDir,
    maxBytes: env.streamCacheMaxBytes,
    ttlSeconds: env.streamCacheTtlSeconds,
  }),
};
// Warm the stream cache right after each generation so first playback is instant.
setPrewarmStreamCache(audio.streamCache);

app.route("/api", createApiRoutes(db, { send, createStarsInvoiceLink, audio }));

bot.start();

const stopPoller = startPoller(db, notifyFulfilled);
const stopPlategaPoller = startPlategaPoller(db, notifyFulfilled);
process.on("SIGTERM", () => {
  stopPoller();
  stopPlategaPoller();
});
process.on("SIGINT", () => {
  stopPoller();
  stopPlategaPoller();
});

export default {
  port: env.port,
  fetch: app.fetch,
};
