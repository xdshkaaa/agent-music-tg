import type { AppDb } from "../db";
import { countUsers } from "../access/users-store";

export type StatsPeriod = "today" | "week" | "month" | "all";

export interface RevenueByAsset {
  asset: string;
  total: number;
}

export interface TopOffer {
  title: string;
  count: number;
}

export interface TopUser {
  chatId: number;
  username: string | null;
  generations: number;
}

export interface UserSegments {
  activeSubscription: number;
  trialActive: number;
  payingNoSubscription: number;
  freeNoActivity: number;
}

export interface AdminStats {
  period: StatsPeriod;
  totalUsers: number;
  newUsers: number;
  activeSubscriptions: number;
  paidPurchases: number;
  revenue: RevenueByAsset[];
  revenueAllTime: RevenueByAsset[];
  conversionRate: number | null;
  topOffers: TopOffer[];
  topActiveUsers: TopUser[];
  segments: UserSegments;
}

const PERIOD_SECONDS: Record<Exclude<StatsPeriod, "all">, number> = {
  today: 86400,
  week: 7 * 86400,
  month: 30 * 86400,
};

/** Unix cutoff for the period, or null for "all" (no lower bound). */
function periodCutoff(period: StatsPeriod): number | null {
  if (period === "all") return null;
  return Math.floor(Date.now() / 1000) - PERIOD_SECONDS[period];
}

/**
 * Aggregates admin-facing stats. `revenue`/`paidPurchases`/`newUsers`/
 * `topOffers` are scoped to `period`; `totalUsers`, `activeSubscriptions` and
 * `revenueAllTime` are always all-time context. Fulfilled purchases only
 * (status = 'paid').
 */
export function getAdminStats(db: AppDb, period: StatsPeriod = "all"): AdminStats {
  const cutoff = periodCutoff(period);
  const now = Math.floor(Date.now() / 1000);

  const newUsers = cutoff === null
    ? countUsers(db)
    : (db.query<{ n: number }, [number]>(`SELECT COUNT(*) AS n FROM users WHERE first_seen >= ?`).get(cutoff)?.n ?? 0);

  const activeSubscriptions =
    db.query<{ n: number }, [number]>(`SELECT COUNT(*) AS n FROM users WHERE subscription_until > ?`).get(now)?.n ?? 0;

  const paid = cutoff === null
    ? db.query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM invoices WHERE status = 'paid'`).get()
    : db.query<{ n: number }, [number]>(`SELECT COUNT(*) AS n FROM invoices WHERE status = 'paid' AND paid_at >= ?`).get(cutoff);

  const revenueRows = cutoff === null
    ? db
        .query<{ asset: string; total: number }, []>(
          `SELECT asset, SUM(CAST(amount AS REAL)) AS total FROM invoices WHERE status = 'paid' GROUP BY asset ORDER BY asset`,
        )
        .all()
    : db
        .query<{ asset: string; total: number }, [number]>(
          `SELECT asset, SUM(CAST(amount AS REAL)) AS total FROM invoices WHERE status = 'paid' AND paid_at >= ? GROUP BY asset ORDER BY asset`,
        )
        .all(cutoff);

  const revenueAllTimeRows = db
    .query<{ asset: string; total: number }, []>(
      `SELECT asset, SUM(CAST(amount AS REAL)) AS total FROM invoices WHERE status = 'paid' GROUP BY asset ORDER BY asset`,
    )
    .all();

  const topOffersRows = cutoff === null
    ? db
        .query<{ title: string; count: number }, []>(
          `SELECT o.title AS title, COUNT(*) AS count FROM invoices i
           JOIN offers o ON o.id = i.offer_id
           WHERE i.status = 'paid'
           GROUP BY i.offer_id ORDER BY count DESC LIMIT 3`,
        )
        .all()
    : db
        .query<{ title: string; count: number }, [number]>(
          `SELECT o.title AS title, COUNT(*) AS count FROM invoices i
           JOIN offers o ON o.id = i.offer_id
           WHERE i.status = 'paid' AND i.paid_at >= ?
           GROUP BY i.offer_id ORDER BY count DESC LIMIT 3`,
        )
        .all(cutoff);

  const paidPurchases = paid?.n ?? 0;

  const topActiveUsersRows = cutoff === null
    ? db
        .query<{ chat_id: number; username: string | null; n: number }, []>(
          `SELECT g.chat_id AS chat_id, u.username AS username, COUNT(*) AS n FROM generations g
           LEFT JOIN users u ON u.chat_id = g.chat_id
           GROUP BY g.chat_id ORDER BY n DESC LIMIT 5`,
        )
        .all()
    : db
        .query<{ chat_id: number; username: string | null; n: number }, [number]>(
          `SELECT g.chat_id AS chat_id, u.username AS username, COUNT(*) AS n FROM generations g
           LEFT JOIN users u ON u.chat_id = g.chat_id
           WHERE g.created_at >= ?
           GROUP BY g.chat_id ORDER BY n DESC LIMIT 5`,
        )
        .all(cutoff);

  // Segments are a snapshot of current state (not period-scoped) and are
  // mutually exclusive / exhaustive over all users, checked in priority
  // order: active subscription > active trial > ever paid > free/no activity.
  const activeSubCount = activeSubscriptions;
  const trialActiveCount =
    db
      .query<{ n: number }, [number, number]>(
        `SELECT COUNT(*) AS n FROM users
         WHERE trial_until > ? AND trial_credits > 0 AND (subscription_until IS NULL OR subscription_until <= ?)`,
      )
      .get(now, now)?.n ?? 0;
  const payingNoSubCount =
    db
      .query<{ n: number }, [number, number]>(
        `SELECT COUNT(*) AS n FROM users u
         WHERE (u.subscription_until IS NULL OR u.subscription_until <= ?)
           AND NOT (u.trial_until > ? AND u.trial_credits > 0)
           AND EXISTS (SELECT 1 FROM invoices i WHERE i.chat_id = u.chat_id AND i.status = 'paid')`,
      )
      .get(now, now)?.n ?? 0;
  const totalUsersCount = countUsers(db);
  const freeNoActivityCount = totalUsersCount - activeSubCount - trialActiveCount - payingNoSubCount;

  return {
    period,
    totalUsers: countUsers(db),
    newUsers,
    activeSubscriptions,
    paidPurchases,
    revenue: revenueRows.map((r) => ({ asset: r.asset, total: r.total })),
    revenueAllTime: revenueAllTimeRows.map((r) => ({ asset: r.asset, total: r.total })),
    conversionRate: newUsers > 0 ? paidPurchases / newUsers : null,
    topOffers: topOffersRows.map((r) => ({ title: r.title, count: r.count })),
    topActiveUsers: topActiveUsersRows.map((r) => ({ chatId: r.chat_id, username: r.username, generations: r.n })),
    segments: {
      activeSubscription: activeSubCount,
      trialActive: trialActiveCount,
      payingNoSubscription: payingNoSubCount,
      freeNoActivity: freeNoActivityCount,
    },
  };
}
