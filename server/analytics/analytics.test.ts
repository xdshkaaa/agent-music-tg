import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { openDb } from "../db";
import { upsertUser } from "../access/users-store";
import { getFunnel, getTrafficSources, getUtmCampaigns } from "./report";
import { parseStartAttribution, recordAttributionTouch, recordDailyEvent, recordEvent, recordFirstTouch } from "./store";
import { verifyInitData } from "../lib/telegram-init-data";
import { getAdminStats } from "../admin/stats";

describe("first-touch attribution", () => {
  test("parses UTM, source-only, referral, and direct Telegram payloads", () => {
    expect(parseStartAttribution("utm_vk__cpc__summer-2026__banner-a__indie")).toEqual({
      source: "vk",
      medium: "cpc",
      campaign: "summer-2026",
      content: "banner-a",
      term: "indie",
      startParam: "utm_vk__cpc__summer-2026__banner-a__indie",
    });
    expect(parseStartAttribution("src_youtube")).toMatchObject({ source: "youtube", medium: "telegram" });
    expect(parseStartAttribution("src_youtube_ads")).toMatchObject({ source: "youtube_ads", medium: "telegram" });
    expect(parseStartAttribution("ref_12345")).toMatchObject({
      source: "referral",
      medium: "telegram",
      campaign: "member-get-member",
      content: "referrer-12345",
    });
    expect(parseStartAttribution(null)).toMatchObject({ source: "direct", medium: "telegram", campaign: null });
  });

  test("reads Telegram's signed start_param for Mini App deep links", () => {
    const token = "123:test-token";
    const params = new URLSearchParams({
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: JSON.stringify({ id: 101, first_name: "Test" }),
      start_param: "utm_vk__cpc__summer",
    });
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");
    const secret = createHmac("sha256", "WebAppData").update(token).digest();
    params.set("hash", createHmac("sha256", secret).update(dataCheckString).digest("hex"));

    expect(verifyInitData(params.toString(), token)?.startParam).toBe("utm_vk__cpc__summer");
  });

  test("keeps the first source when a user launches again with another campaign", () => {
    const db = openDb(":memory:");
    upsertUser(db, 101);

    expect(recordFirstTouch(db, 101, parseStartAttribution("utm_vk__cpc__summer"))).toBe(true);
    expect(recordFirstTouch(db, 101, parseStartAttribution("utm_youtube__video__autumn"))).toBe(false);

    expect(db.query(`SELECT source, medium, campaign FROM user_attribution WHERE chat_id = 101`).get()).toEqual({
      source: "vk",
      medium: "cpc",
      campaign: "summer",
    });
  });

  test("replaces migration placeholders but preserves real first-touch attribution", () => {
    const db = openDb(":memory:");
    upsertUser(db, 101);
    db.run(`INSERT INTO user_attribution (chat_id, source, medium) VALUES (101, 'unknown', 'legacy')`);

    expect(recordFirstTouch(db, 101, parseStartAttribution("utm_vk__cpc__launch"))).toBe(true);
    expect(recordFirstTouch(db, 101, parseStartAttribution("utm_youtube__video__later"))).toBe(false);
    expect(db.query(`SELECT source, medium, campaign FROM user_attribution WHERE chat_id = 101`).get()).toEqual({
      source: "vk",
      medium: "cpc",
      campaign: "launch",
    });
  });
});

describe("analytics events", () => {
  test("deduplicates daily views but preserves repeated product actions", () => {
    const db = openDb(":memory:");
    upsertUser(db, 101);

    expect(recordDailyEvent(db, 101, "miniapp_opened")).toBe(true);
    expect(recordDailyEvent(db, 101, "miniapp_opened")).toBe(false);
    expect(recordEvent(db, 101, "generation_started")).toBe(true);
    expect(recordEvent(db, 101, "generation_started")).toBe(true);

    const rows = db.query<{ event_name: string; n: number }, []>(
      `SELECT event_name, COUNT(*) AS n FROM analytics_events GROUP BY event_name ORDER BY event_name`,
    ).all();
    expect(rows).toEqual([
      { event_name: "generation_started", n: 2 },
      { event_name: "miniapp_opened", n: 1 },
    ]);
  });
});

describe("acquisition reports", () => {
  test("counts a returning user's tagged visit in the UTM campaign report", () => {
    const db = openDb(":memory:");
    upsertUser(db, 404);
    recordFirstTouch(db, 404, parseStartAttribution(null));
    recordAttributionTouch(db, 404, parseStartAttribution("utm_channel__post__release"));

    expect(getTrafficSources(db, "all")[0]).toMatchObject({ source: "direct", users: 1 });
    expect(getUtmCampaigns(db, "all")[0]).toMatchObject({
      source: "channel",
      medium: "post",
      campaign: "release",
      users: 1,
    });
  });

  test("groups cohort users, payers, revenue, campaigns, and unique-user funnel steps", () => {
    const db = openDb(":memory:");
    for (const chatId of [101, 202, 303]) upsertUser(db, chatId);
    recordFirstTouch(db, 101, parseStartAttribution("utm_vk__cpc__summer"));
    recordAttributionTouch(db, 101, parseStartAttribution("utm_vk__cpc__summer"));
    recordFirstTouch(db, 202, parseStartAttribution(null));
    recordFirstTouch(db, 303, parseStartAttribution("ref_101"));

    recordDailyEvent(db, 101, "miniapp_opened");
    recordEvent(db, 101, "generation_started");
    recordEvent(db, 101, "generation_completed", {}, "generation:101");
    recordEvent(db, 101, "checkout_started");
    recordEvent(db, 101, "purchase_completed", {}, "purchase:101");
    recordDailyEvent(db, 202, "miniapp_opened");
    recordEvent(db, 202, "generation_completed", {}, "generation:202");

    db.run(`
      INSERT INTO offers (id, title, amount, asset, grant_kind, grant_amount)
      VALUES (1, '100 звёзд', '100', 'XTR', 'credits', 10);
      INSERT INTO invoices (provider, external_id, chat_id, offer_id, amount, asset, status, paid_at)
      VALUES ('stars', 'paid-101', 101, 1, '100', 'XTR', 'paid', unixepoch());
    `);

    expect(getFunnel(db, "all").map(({ event, users, overallConversion }) => ({ event, users, overallConversion }))).toEqual([
      { event: "acquired", users: 3, overallConversion: 1 },
      { event: "miniapp_opened", users: 2, overallConversion: 2 / 3 },
      { event: "generation_started", users: 2, overallConversion: 2 / 3 },
      { event: "generation_completed", users: 2, overallConversion: 2 / 3 },
      { event: "checkout_started", users: 1, overallConversion: 1 / 3 },
      { event: "purchase_completed", users: 1, overallConversion: 1 / 3 },
    ]);

    expect(getTrafficSources(db, "all")).toEqual([
      {
        source: "vk",
        medium: "cpc",
        campaign: null,
        users: 1,
        payers: 1,
        conversionRate: 1,
        revenue: [{ asset: "XTR", total: 100 }],
      },
      {
        source: "direct",
        medium: "telegram",
        campaign: null,
        users: 1,
        payers: 0,
        conversionRate: 0,
        revenue: [],
      },
      {
        source: "referral",
        medium: "telegram",
        campaign: null,
        users: 1,
        payers: 0,
        conversionRate: 0,
        revenue: [],
      },
    ]);
    expect(getUtmCampaigns(db, "all")).toEqual([
      {
        source: "vk",
        medium: "cpc",
        campaign: "summer",
        users: 1,
        payers: 1,
        conversionRate: 1,
        revenue: [{ asset: "XTR", total: 100 }],
      },
    ]);
    const adminStats = getAdminStats(db, "all");
    expect(adminStats.conversionRate).toBe(1 / 3);
    expect(adminStats.trafficSources[0]?.source).toBe("vk");
  });
});
