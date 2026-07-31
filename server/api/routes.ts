import { Hono, type MiddlewareHandler } from "hono";
import type { AppDb } from "../db";
import type { AppEnv, ApiDeps } from "./context";
import { requireAuth, requireAuthAllowUnlisted, requireSubscription } from "./middleware";
import { upsertUser } from "../access/users-store";
import { alertNewUser } from "../payments/alerts";
import { createAudioRoutes } from "./audio-routes";
import { createMeRoutes } from "./me-routes";
import { createPlaylistRoutes } from "./playlist-routes";
import { createSearchRoutes } from "./search-routes";
import { createOfferRoutes } from "./offer-routes";
import { createAdminRoutes } from "./admin-routes";
import { createGenerationRoutes } from "./generation-routes";
import { createFeedbackRoutes } from "./feedback-routes";
import { createShareRoutes, createPublicShareRoutes } from "./share-routes";
import { createSubscriptionRoutes } from "./subscription-routes";
import { parseShareToken } from "../access/share-link";
import { getShare } from "../access/shares-store";
import { applyReferral } from "../access/referral-store";
import { parseStartAttribution, recordAttributionTouch, recordFirstTouch } from "../analytics/store";

export type { ApiDeps } from "./context";

export function createApiRoutes(db: AppDb, deps: ApiDeps = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Record every authenticated caller as a known user (audience + stats).
  // Streaming is exempt: one played track fires many Range requests, and the
  // user is already recorded by whatever request opened the player.
  const recordCaller: MiddlewareHandler<AppEnv> = async (c, next) => {
    if (c.req.path.startsWith("/api/stream/")) return next();
    const chatId = c.get("chatId");
    const telegramUser = c.get("telegramUser");
    const isNew = upsertUser(db, chatId, telegramUser.username, telegramUser.first_name);
    if (isNew) {
      alertNewUser(c.get("chatId")).catch(() => {});
    }
    const startParam = c.get("startParam");
    if (startParam || isNew) {
      const attribution = parseStartAttribution(startParam);
      recordFirstTouch(db, chatId, attribution);
      if (startParam) recordAttributionTouch(db, chatId, attribution);
    }
    // A share link is also a referral: the author brought this person in, so
    // the same crediting path the ref_ links use applies here. applyReferral is
    // idempotent per invitee, so reopening the link changes nothing.
    const shareToken = parseShareToken(startParam);
    if (shareToken) {
      const share = getShare(db, shareToken);
      if (share && share.revokedAt === null) {
        applyReferral(db, share.ownerChatId, chatId);
      }
    }
    await next();
  };

  // Reading a shared playlist must work for someone who is not a user yet, so
  // it gets its own auth without the allowlist gate. Scoped to GET so revoking
  // (DELETE on the same path) still goes through the normal gate below, and
  // registered first so its handler ends the chain before that gate runs.
  app.on("GET", "/shares/:token", requireAuthAllowUnlisted(db), recordCaller);
  app.route("/", createPublicShareRoutes(db));

  app.use("*", requireAuth(db));
  app.use("*", recordCaller);

  // Subscription recheck must be reachable while the user is gated — register
  // it before the subscription gate middleware.
  app.route("/", createSubscriptionRoutes(db, deps));
  app.use("*", requireSubscription(db, deps));

  app.route("/", createShareRoutes(db));
  app.route("/", createMeRoutes(db));
  app.route("/", createPlaylistRoutes(db, deps));
  app.route("/", createSearchRoutes(db));
  app.route("/", createOfferRoutes(db, deps));
  app.route("/", createAdminRoutes(db, deps));
  app.route("/", createGenerationRoutes(db));
  app.route("/", createFeedbackRoutes(db));

  if (deps.audio) {
    app.route("/", createAudioRoutes(db, deps.audio));
  }

  return app;
}
