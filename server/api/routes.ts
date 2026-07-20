import { Hono } from "hono";
import type { AppDb } from "../db";
import type { AppEnv, ApiDeps } from "./context";
import { requireAuth } from "./middleware";
import { upsertUser } from "../access/users-store";
import { alertNewUser } from "../payments/alerts";
import { createAudioRoutes } from "./audio-routes";
import { createMeRoutes } from "./me-routes";
import { createPlaylistRoutes } from "./playlist-routes";
import { createSearchRoutes } from "./search-routes";
import { createOfferRoutes } from "./offer-routes";
import { createAdminRoutes } from "./admin-routes";
import { createGenerationRoutes } from "./generation-routes";
import { parseStartAttribution, recordFirstTouch } from "../analytics/store";

export type { ApiDeps } from "./context";

export function createApiRoutes(db: AppDb, deps: ApiDeps = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("*", requireAuth(db));

  // Record every authenticated caller as a known user (audience + stats).
  app.use("*", async (c, next) => {
    const chatId = c.get("chatId");
    const isNew = upsertUser(db, chatId);
    if (isNew) {
      alertNewUser(c.get("chatId")).catch(() => {});
    }
    const startParam = c.get("startParam");
    if (startParam || isNew) {
      recordFirstTouch(db, chatId, parseStartAttribution(startParam));
    }
    await next();
  });

  app.route("/", createMeRoutes(db));
  app.route("/", createPlaylistRoutes(db, deps));
  app.route("/", createSearchRoutes(db));
  app.route("/", createOfferRoutes(db, deps));
  app.route("/", createAdminRoutes(db, deps));
  app.route("/", createGenerationRoutes(db));

  if (deps.audio) {
    app.route("/", createAudioRoutes(db, deps.audio));
  }

  return app;
}
