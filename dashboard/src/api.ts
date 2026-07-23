export type DashEnvId = "prod" | "dev";
export type StatsPeriod = "today" | "week" | "month" | "all";

export interface RevenueByAsset { asset: string; total: number }
export interface TopOffer { title: string; count: number }
export interface TopUser { chatId: number; username: string | null; generations: number }
export interface UserSegments {
  activeSubscription: number;
  trialActive: number;
  payingNoSubscription: number;
  freeNoActivity: number;
}
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
  revenue: RevenueByAsset[];
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
  funnel: FunnelStep[];
  trafficSources: AttributionBreakdown[];
  utmCampaigns: AttributionBreakdown[];
}

export interface Offer {
  id: number;
  title: string;
  amount: string;
  asset: string;
  starsAmount: number | null;
  rubAmount: number | null;
  icon: string | null;
  active: boolean;
  grantKind: "credits" | "subscription";
  grantAmount: number;
}

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

export interface GrantHistoryRecord {
  id: number;
  chatId: number;
  type: "credits" | "subscription" | "subscription_revoked";
  amount: number;
  grantedBy: number;
  createdAt: number;
}

export interface DailySeriesPoint {
  day: string;
  newUsers: number;
  generations: number;
  revenue: number;
}

export interface DashSession {
  chatId: number;
  username: string | null;
  issuedAt: number;
}

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export { ApiError };

export const api = {
  config: () => request<{ botUsername: string }>("/dash/config"),
  me: () => request<DashSession>("/dash/me"),
  logout: () => request<{ ok: true }>("/dash/logout", { method: "POST" }),
  loginWithWidget: (payload: Record<string, string>) =>
    request<{ ok: true; session: DashSession }>("/dash/login", { method: "POST", body: JSON.stringify(payload) }),
  stats: (env: DashEnvId, period: StatsPeriod) => request<AdminStats>(`/dash/${env}/stats?period=${period}`),
  series: (env: DashEnvId, days = 30) => request<{ series: DailySeriesPoint[] }>(`/dash/${env}/series?days=${days}`),
  offers: (env: DashEnvId) => request<{ offers: Offer[] }>(`/dash/${env}/offers`),
  purchases: (env: DashEnvId, limit = 25) => request<{ purchases: RecentPurchaseRow[] }>(`/dash/${env}/purchases?limit=${limit}`),
  grantHistory: (env: DashEnvId, limit = 25) =>
    request<{ history: GrantHistoryRecord[]; total: number }>(`/dash/${env}/grant-history?limit=${limit}`),
  environments: () => request<{ prod: boolean; dev: boolean }>("/dash/environments"),
};
