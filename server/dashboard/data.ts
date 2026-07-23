import type { AppDb } from "../db";

export interface RecentPurchaseRow {
  id: number;
  chatId: number;
  username: string | null;
  offerTitle: string | null;
  amount: string;
  asset: string;
  provider: string;
  status: string;
  createdAt: number;
  paidAt: number | null;
}

/** Most recent invoices across all statuses, newest first — the operational "what's happening now" table. */
export function getRecentPurchases(db: AppDb, limit = 25): RecentPurchaseRow[] {
  return db
    .query<
      {
        id: number; chat_id: number; username: string | null; offer_title: string | null;
        amount: string; asset: string; provider: string; status: string; created_at: number; paid_at: number | null;
      },
      [number]
    >(
      `SELECT i.id, i.chat_id, u.username AS username, o.title AS offer_title,
              i.amount, i.asset, i.provider, i.status, i.created_at, i.paid_at
       FROM invoices i
       LEFT JOIN users u ON u.chat_id = i.chat_id
       LEFT JOIN offers o ON o.id = i.offer_id
       ORDER BY i.created_at DESC LIMIT ?`,
    )
    .all(limit)
    .map((r) => ({
      id: r.id,
      chatId: r.chat_id,
      username: r.username,
      offerTitle: r.offer_title,
      amount: r.amount,
      asset: r.asset,
      provider: r.provider,
      status: r.status,
      createdAt: r.created_at,
      paidAt: r.paid_at,
    }));
}

export interface DailySeriesPoint {
  day: string; // YYYY-MM-DD (UTC)
  newUsers: number;
  generations: number;
  revenue: number;
}

/** Last N days of new users / generations / paid-invoice revenue (all assets summed as-is), for the trend chart. */
export function getDailySeries(db: AppDb, days = 30): DailySeriesPoint[] {
  const since = Math.floor(Date.now() / 1000) - days * 86400;

  const usersByDay = new Map<string, number>();
  for (const r of db
    .query<{ day: string; n: number }, [number]>(
      `SELECT date(first_seen, 'unixepoch') AS day, COUNT(*) AS n FROM users WHERE first_seen >= ? GROUP BY day`,
    )
    .all(since)) {
    usersByDay.set(r.day, r.n);
  }

  const generationsByDay = new Map<string, number>();
  for (const r of db
    .query<{ day: string; n: number }, [number]>(
      `SELECT date(created_at, 'unixepoch') AS day, COUNT(*) AS n FROM generations WHERE created_at >= ? GROUP BY day`,
    )
    .all(since)) {
    generationsByDay.set(r.day, r.n);
  }

  const revenueByDay = new Map<string, number>();
  for (const r of db
    .query<{ day: string; total: number }, [number]>(
      `SELECT date(paid_at, 'unixepoch') AS day, SUM(CAST(amount AS REAL)) AS total
       FROM invoices WHERE status = 'paid' AND paid_at >= ? GROUP BY day`,
    )
    .all(since)) {
    revenueByDay.set(r.day, r.total);
  }

  const points: DailySeriesPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000);
    const day = d.toISOString().slice(0, 10);
    points.push({
      day,
      newUsers: usersByDay.get(day) ?? 0,
      generations: generationsByDay.get(day) ?? 0,
      revenue: revenueByDay.get(day) ?? 0,
    });
  }
  return points;
}
