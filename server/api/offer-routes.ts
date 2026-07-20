import { Hono } from "hono";
import type { AppDb } from "../db";
import type { AppEnv, ApiDeps } from "./context";
import { env } from "../env";
import { getPaymentsEnabled, getShopSettings } from "../lib/settings";
import { claimTrial, getUser } from "../access/users-store";
import { listActiveOffers, getOffer } from "../payments/offers-store";
import { purchaseOffer, purchaseOfferRub, OfferUnavailableError, RubPriceMissingError } from "../payments/purchase";
import { UnsupportedAssetError } from "../payments/crypto-pay";
import { plategaEnabled } from "../payments/platega";
import { trialStatus, readJsonBody } from "./shared";
import { recordDailyEvent, recordEvent } from "../analytics/store";

/** User-facing shop: trial claim, offer listing, and invoice creation. */
export function createOfferRoutes(db: AppDb, deps: ApiDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Free trial claim: instant grant, no invoice. Gated like /invoices — when
  // payments are off the paywall is bypassed, so a trial is meaningless.
  app.post("/trial/claim", (c) => {
    if (!getPaymentsEnabled(db, env.paymentsEnabled)) {
      return c.json({ error: "payments disabled" }, 503);
    }
    const chatId = c.get("chatId");
    if (!claimTrial(db, chatId)) {
      return c.json({ error: "trial already claimed" }, 409);
    }
    recordEvent(db, chatId, "trial_claimed");
    return c.json({ trial: trialStatus(getUser(db, chatId)) });
  });

  app.get("/offers", (c) => {
    recordDailyEvent(db, c.get("chatId"), "shop_viewed");
    return c.json({ offers: listActiveOffers(db) });
  });

  app.get("/shop-config", (c) => {
    const { headerIcon, headerTitle, supportContact } = getShopSettings(db);
    return c.json({ headerIcon, headerTitle, supportContact });
  });

  app.post("/invoices", async (c) => {
    if (!getPaymentsEnabled(db, env.paymentsEnabled)) {
      return c.json({ error: "payments disabled" }, 503);
    }
    const body = await readJsonBody<{ offerId: number; method?: string }>(c.req.raw);
    const offerId = Number(body.offerId);
    if (!Number.isFinite(offerId)) return c.json({ error: "offerId is required" }, 400);
    const method = body.method ?? "crypto";
    if (method !== "crypto" && method !== "stars" && method !== "platega") {
      return c.json({ error: "method must be crypto|stars|platega" }, 400);
    }

    if (method === "platega") {
      if (!plategaEnabled()) return c.json({ error: "platega payments unavailable" }, 503);
      const offer = getOffer(db, offerId);
      if (!offer || !offer.active) return c.json({ error: "offer is not available" }, 400);
      if (!offer.rubAmount) return c.json({ error: "offer has no RUB price" }, 400);
      try {
        const result = await purchaseOfferRub(db, c.get("chatId"), offerId);
        return c.json({ id: result.invoiceId, payUrl: result.payUrl, offerTitle: result.offerTitle, method: "platega" });
      } catch (e) {
        if (e instanceof OfferUnavailableError || e instanceof RubPriceMissingError) {
          return c.json({ error: e.message }, 400);
        }
        return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
      }
    }

    if (method === "stars") {
      const offer = getOffer(db, offerId);
      if (!offer || !offer.active) return c.json({ error: "offer is not available" }, 400);
      if (!offer.starsAmount) return c.json({ error: "offer has no Stars price" }, 400);
      if (!deps.createStarsInvoiceLink) return c.json({ error: "stars payments unavailable" }, 503);
      try {
        const payload = JSON.stringify({ chatId: c.get("chatId"), offerId: offer.id });
        const payUrl = await deps.createStarsInvoiceLink({
          title: offer.title,
          description: offer.title,
          payload,
          starsAmount: offer.starsAmount,
        });
        recordEvent(db, c.get("chatId"), "checkout_started", { method: "stars", offerId });
        return c.json({ payUrl, method: "stars", offerTitle: offer.title });
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
      }
    }

    try {
      const result = await purchaseOffer(db, c.get("chatId"), offerId);
      return c.json({ id: result.invoiceId, payUrl: result.payUrl, offerTitle: result.offerTitle, method: "crypto" });
    } catch (e) {
      if (e instanceof OfferUnavailableError) return c.json({ error: e.message }, 400);
      if (e instanceof UnsupportedAssetError) {
        return c.json({ error: "crypto asset unsupported", asset: e.asset }, 400);
      }
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
    }
  });

  return app;
}
