import type { AppDb } from "../db";

export type AnalyticsPeriod = "today" | "week" | "month" | "all";

export interface FunnelStep {
  event: "acquired" | "miniapp_opened" | "generation_started" | "generation_completed" | "checkout_started" | "purchase_completed";
  users: number;
  stepConversion: number | null;
  overallConversion: number | null;
}

export interface AttributionBreakdown {
  source: string;
  medium: string | null;
  campaign: string | null;
  users: number;
  payers: number;
  conversionRate: number | null;
  revenue: { asset: string; total: number }[];
}

const PERIOD_SECONDS: Record<Exclude<AnalyticsPeriod, "all">, number> = {
  today: 86400,
  week: 7 * 86400,
  month: 30 * 86400,
};

function cutoffFor(period: AnalyticsPeriod): number | null {
  return period === "all" ? null : Math.floor(Date.now() / 1000) - PERIOD_SECONDS[period];
}

function cohortWhere(period: AnalyticsPeriod): { sql: string; args: [] | [number] } {
  const cutoff = cutoffFor(period);
  return cutoff === null ? { sql: "", args: [] } : { sql: "WHERE u.first_seen >= ?", args: [cutoff] };
}

function countCohortStage(db: AppDb, period: AnalyticsPeriod, names: string[] | null): number {
  const cohort = cohortWhere(period);
  if (!names) {
    return db.query<{ n: number }, [] | [number]>(`SELECT COUNT(*) AS n FROM users u ${cohort.sql}`).get(...cohort.args)?.n ?? 0;
  }
  const placeholders = names.map(() => "?").join(", ");
  const args = [...cohort.args, ...names] as Array<number | string>;
  return db.query<{ n: number }, Array<number | string>>(
    `SELECT COUNT(*) AS n FROM users u ${cohort.sql}
     ${cohort.sql ? "AND" : "WHERE"} EXISTS (
       SELECT 1 FROM analytics_events e
       WHERE e.chat_id = u.chat_id AND e.event_name IN (${placeholders})
     )`,
  ).get(...args)?.n ?? 0;
}

/** Acquisition cohort funnel: users acquired in the selected period, then eventual downstream actions. */
export function getFunnel(db: AppDb, period: AnalyticsPeriod): FunnelStep[] {
  const counts: Array<[FunnelStep["event"], number]> = [
    ["acquired", countCohortStage(db, period, null)],
    ["miniapp_opened", countCohortStage(db, period, ["miniapp_opened"])],
    ["generation_started", countCohortStage(db, period, ["generation_started", "generation_completed"])],
    ["generation_completed", countCohortStage(db, period, ["generation_completed"])],
    ["checkout_started", countCohortStage(db, period, ["checkout_started", "purchase_completed"])],
    ["purchase_completed", countCohortStage(db, period, ["purchase_completed"])],
  ];
  const acquired = counts[0]![1];
  return counts.map(([event, users], index) => {
    const previous = index === 0 ? null : counts[index - 1]![1];
    return {
      event,
      users,
      stepConversion: previous && previous > 0 ? users / previous : index === 0 ? 1 : null,
      overallConversion: acquired > 0 ? users / acquired : null,
    };
  });
}

interface BreakdownCountRow {
  source: string;
  medium: string | null;
  campaign: string | null;
  users: number;
  payers: number;
}

interface BreakdownRevenueRow {
  source: string;
  medium: string | null;
  campaign: string | null;
  asset: string;
  total: number;
}

function getBreakdown(db: AppDb, period: AnalyticsPeriod, byCampaign: boolean): AttributionBreakdown[] {
  const cutoff = cutoffFor(period);
  const periodClause = cutoff === null ? "" : "AND u.first_seen >= ?";
  const campaignClause = byCampaign
    ? `AND a.campaign IS NOT NULL AND a.start_param LIKE 'utm\\_%' ESCAPE '\\'`
    : "";
  const group = byCampaign ? "a.source, a.medium, a.campaign" : "a.source, a.medium";
  const args = cutoff === null ? [] as [] : [cutoff] as [number];
  const counts = db.query<BreakdownCountRow, [] | [number]>(
    `SELECT
       COALESCE(a.source, 'unknown') AS source,
       a.medium AS medium,
       ${byCampaign ? "a.campaign" : "NULL"} AS campaign,
       COUNT(DISTINCT u.chat_id) AS users,
       COUNT(DISTINCT CASE WHEN i.status = 'paid' THEN u.chat_id END) AS payers
     FROM users u
     LEFT JOIN user_attribution a ON a.chat_id = u.chat_id
     LEFT JOIN invoices i ON i.chat_id = u.chat_id
     WHERE 1 = 1 ${periodClause} ${campaignClause}
     GROUP BY ${group}
     ORDER BY users DESC, payers DESC, source ASC`,
  ).all(...args);

  const revenues = db.query<BreakdownRevenueRow, [] | [number]>(
    `SELECT
       COALESCE(a.source, 'unknown') AS source,
       a.medium AS medium,
       ${byCampaign ? "a.campaign" : "NULL"} AS campaign,
       i.asset AS asset,
       SUM(CAST(i.amount AS REAL)) AS total
     FROM users u
     LEFT JOIN user_attribution a ON a.chat_id = u.chat_id
     JOIN invoices i ON i.chat_id = u.chat_id AND i.status = 'paid'
     WHERE 1 = 1 ${periodClause} ${campaignClause}
     GROUP BY ${group}, i.asset`,
  ).all(...args);

  const grouped = new Map<string, AttributionBreakdown>();
  for (const row of counts) {
    const key = `${row.source}\u0000${row.medium ?? ""}\u0000${row.campaign ?? ""}`;
    grouped.set(key, {
      source: row.source,
      medium: row.medium,
      campaign: row.campaign,
      users: row.users,
      payers: row.payers,
      conversionRate: row.users > 0 ? row.payers / row.users : null,
      revenue: [],
    });
  }
  for (const row of revenues) {
    const key = `${row.source}\u0000${row.medium ?? ""}\u0000${row.campaign ?? ""}`;
    grouped.get(key)?.revenue.push({ asset: row.asset, total: row.total });
  }
  return [...grouped.values()];
}

export function getTrafficSources(db: AppDb, period: AnalyticsPeriod): AttributionBreakdown[] {
  return getBreakdown(db, period, false);
}

export function getUtmCampaigns(db: AppDb, period: AnalyticsPeriod): AttributionBreakdown[] {
  return getBreakdown(db, period, true);
}
