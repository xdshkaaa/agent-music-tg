import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { AppDb } from "../db";
import { dashEnv } from "./env";
import { verifyTelegramLogin, signSession, verifySession, type DashSession } from "./auth";
import { getAdminStats, type StatsPeriod } from "../admin/stats";
import { listOffers } from "../payments/offers-store";
import { getAllGrantHistory, countGrantHistory } from "../admin/grant-history";
import { getRecentPurchases, getDailySeries } from "./data";

export type DashEnvId = "prod" | "dev";

const SESSION_COOKIE = "dash_session";

interface DashAppEnv {
  Variables: { session: DashSession };
}

export function createDashboardRoutes(dbs: Record<DashEnvId, AppDb | null>): Hono<DashAppEnv> {
  const app = new Hono<DashAppEnv>();

  // --- Auth ----------------------------------------------------------------

  app.get("/dash/config", (c) => {
    return c.json({ botUsername: dashEnv.telegramBotUsername });
  });

  app.post("/dash/login", async (c) => {
    if (!dashEnv.telegramBotToken) return c.json({ error: "TELEGRAM_BOT_TOKEN not configured" }, 500);
    const body = (await c.req.json().catch(() => null)) as Record<string, string> | null;
    if (!body) return c.json({ error: "invalid payload" }, 400);
    const verified = verifyTelegramLogin(body, dashEnv.telegramBotToken);
    if (!verified) return c.json({ error: "signature invalid or expired" }, 401);
    if (!dashEnv.adminChatIds.includes(verified.id)) {
      return c.json({ error: "этот аккаунт не входит в список администраторов" }, 403);
    }
    const session: DashSession = { chatId: verified.id, username: verified.username ?? null, issuedAt: Math.floor(Date.now() / 1000) };
    const token = signSession(session);
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    return c.json({ ok: true, session });
  });

  app.post("/dash/logout", (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  app.use("/dash/*", async (c, next) => {
    if (c.req.path === "/dash/login" || c.req.path === "/dash/config") return next();
    const token = getCookie(c, SESSION_COOKIE);
    const session = verifySession(token);
    if (!session) return c.json({ error: "unauthenticated" }, 401);
    c.set("session", session);
    await next();
  });

  app.get("/dash/me", (c) => c.json(c.get("session")));

  // --- Per-environment data --------------------------------------------------

  function resolveDb(c: { req: { param: (k: string) => string | undefined } }): AppDb | null {
    const envId = c.req.param("env");
    if (envId !== "prod" && envId !== "dev") return null;
    return dbs[envId];
  }

  function validPeriod(raw: string | undefined): StatsPeriod {
    return raw === "today" || raw === "week" || raw === "month" || raw === "all" ? raw : "all";
  }

  app.get("/dash/:env/stats", (c) => {
    const db = resolveDb(c);
    if (!db) return c.json({ error: "environment database unavailable" }, 503);
    const period = validPeriod(c.req.query("period"));
    return c.json(getAdminStats(db, period));
  });

  app.get("/dash/:env/series", (c) => {
    const db = resolveDb(c);
    if (!db) return c.json({ error: "environment database unavailable" }, 503);
    const days = Math.min(Math.max(Number(c.req.query("days")) || 30, 7), 90);
    return c.json({ series: getDailySeries(db, days) });
  });

  app.get("/dash/:env/offers", (c) => {
    const db = resolveDb(c);
    if (!db) return c.json({ error: "environment database unavailable" }, 503);
    return c.json({ offers: listOffers(db) });
  });

  app.get("/dash/:env/purchases", (c) => {
    const db = resolveDb(c);
    if (!db) return c.json({ error: "environment database unavailable" }, 503);
    const limit = Math.min(Math.max(Number(c.req.query("limit")) || 25, 1), 100);
    return c.json({ purchases: getRecentPurchases(db, limit) });
  });

  app.get("/dash/:env/grant-history", (c) => {
    const db = resolveDb(c);
    if (!db) return c.json({ error: "environment database unavailable" }, 503);
    const limit = Math.min(Math.max(Number(c.req.query("limit")) || 25, 1), 100);
    return c.json({ history: getAllGrantHistory(db, limit, 0), total: countGrantHistory(db) });
  });

  app.get("/dash/environments", (c) => {
    return c.json({
      prod: dbs.prod !== null,
      dev: dbs.dev !== null,
    });
  });

  return app;
}
