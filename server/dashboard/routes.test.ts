import { describe, expect, test, beforeAll } from "bun:test";

process.env.DASH_SESSION_SECRET = process.env.DASH_SESSION_SECRET || "test-dash-secret";
process.env.DASH_ADMIN_CHAT_IDS = process.env.DASH_ADMIN_CHAT_IDS || "777";

const { openDb } = await import("../db");
const { createDashboardRoutes } = await import("./routes");
const { signSession } = await import("./auth");

const ADMIN = 777;

function authHeaders() {
  const token = signSession({ chatId: ADMIN, username: "admin", issuedAt: Math.floor(Date.now() / 1000) });
  return { cookie: `dash_session=${token}` };
}

describe("dashboard stats caching", () => {
  let db: ReturnType<typeof openDb>;
  let app: ReturnType<typeof createDashboardRoutes>;
  // Counts how many times the aggregates actually touch sqlite.
  let queries = 0;

  beforeAll(() => {
    db = openDb(":memory:");
    const realQuery = db.query.bind(db);
    // Test double over bun:sqlite's query().
    db.query = (sql: string) => {
      queries++;
      return realQuery(sql);
    };
    app = createDashboardRoutes({ prod: db, dev: null });
  });

  test("serves a repeated stats request from cache instead of re-running the aggregates", async () => {
    const first = await app.request("/dash/prod/stats?period=week", { headers: authHeaders() });
    expect(first.status).toBe(200);
    const afterFirst = queries;
    expect(afterFirst).toBeGreaterThan(0);

    const second = await app.request("/dash/prod/stats?period=week", { headers: authHeaders() });
    expect(second.status).toBe(200);
    expect(queries).toBe(afterFirst); // no further DB work
    expect(await second.json()).toEqual(await first.json());
    expect(second.headers.get("cache-control")).toContain("max-age");
  });

  test("caches per period, so a different period still computes", async () => {
    await app.request("/dash/prod/stats?period=week", { headers: authHeaders() });
    const before = queries;
    const res = await app.request("/dash/prod/stats?period=month", { headers: authHeaders() });
    expect(res.status).toBe(200);
    expect(queries).toBeGreaterThan(before);
  });

  test("still rejects an unauthenticated caller", async () => {
    const res = await app.request("/dash/prod/stats?period=week");
    expect(res.status).toBe(401);
  });

  test("reports an unavailable environment rather than serving stale data", async () => {
    const res = await app.request("/dash/dev/stats?period=week", { headers: authHeaders() });
    expect(res.status).toBe(503);
  });
});
