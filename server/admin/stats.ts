import type { AppDb } from "../db";
import { countUsers } from "../access/users-store";

export interface RevenueByAsset {
  asset: string;
  total: number;
}

export interface AdminStats {
  totalUsers: number;
  paidPurchases: number;
  revenue: RevenueByAsset[];
}

/**
 * Aggregates stats from fulfilled (paid) invoices only. Revenue is grouped per
 * asset since offers may be priced in different crypto assets.
 */
export function getAdminStats(db: AppDb): AdminStats {
  const paid = db.query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM invoices WHERE status = 'paid'`).get();
  const rows = db
    .query<{ asset: string; total: number }, []>(
      `SELECT asset, SUM(CAST(amount AS REAL)) AS total FROM invoices WHERE status = 'paid' GROUP BY asset ORDER BY asset`,
    )
    .all();
  return {
    totalUsers: countUsers(db),
    paidPurchases: paid?.n ?? 0,
    revenue: rows.map((r) => ({ asset: r.asset, total: r.total })),
  };
}
