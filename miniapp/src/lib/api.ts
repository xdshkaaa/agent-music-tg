import { getInitData } from "./telegram";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      "X-Telegram-Init-Data": getInitData(),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface TrialStatus {
  claimed: boolean;
  active: boolean;
  creditsLeft: number;
  until: number | null;
}

export interface MeResponse {
  chatId: number;
  username?: string;
  photoUrl: string | null;
  isAdmin: boolean;
  credits: number;
  subscriptionUntil: number | null;
  trial: TrialStatus;
  generationsUsed: number;
}

export type GrantKind = "credits" | "subscription";

export interface Offer {
  id: number;
  title: string;
  amount: string;
  asset: string;
  starsAmount: number | null;
  icon: string | null;
  active: boolean;
  grantKind: GrantKind;
  grantAmount: number;
}

export type PaymentMethod = "crypto" | "stars";

export interface Invoice {
  id: number;
  provider: PaymentMethod;
  externalId: string;
  chatId: number;
  offerId: number;
  amount: string;
  asset: string;
  status: "pending" | "paid";
  createdAt: number;
  paidAt: number | null;
}

export interface InvoiceResult {
  payUrl: string;
  offerTitle: string;
  method: PaymentMethod;
}

export interface AdminStats {
  totalUsers: number;
  paidPurchases: number;
  revenue: { asset: string; total: number }[];
}

export interface ShopSettings {
  shopName: string;
  supportContact: string;
  aboutText: string;
  headerIcon: string;
  headerTitle: string;
}

export interface OfferInput {
  title: string;
  amount: string;
  asset: string;
  starsAmount: number | null;
  icon?: string | null;
  active?: boolean;
  grantKind: GrantKind;
  grantAmount: number;
}

export interface ShopConfig {
  headerIcon: string;
  headerTitle: string;
}

export interface Track {
  uri: string;
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
  artwork?: string;
  deepLink?: string;
}

export interface FinalizedPlaylist {
  name: string;
  tracks: Track[];
  remotePlaylistUrl?: string;
}

export type GenerateOutcome =
  | { status: "ok"; playlist: FinalizedPlaylist }
  | { status: "clarify"; question: string; options: string[] }
  | { status: "needs_purchase" }
  | { status: "error"; message: string };

export interface AdminSettings {
  activeProvider: string;
  activeBackend: string;
  availableProviders: string[];
  availableBackends: string[];
}

// --- New admin types ---

export interface AdminUser {
  chatId: number;
  username: string | null;
  photoFileId: string | null;
  credits: number;
  subscriptionUntil: number | null;
  firstSeen: number;
  lastSeen: number;
}

export interface AllowlistEntry {
  chatId: number;
  isAdmin: boolean;
  createdAt: number;
}

export interface ProviderDefaults {
  model: string;
  baseUrl: string | null;
  apiKeyConfigured: boolean;
}

export interface ProviderConfigEntry {
  id: string;
  envDefaults: ProviderDefaults;
  dbOverrides: { model: string | null; baseUrl: string | null };
  effective: { model: string; baseUrl: string | null };
}

export interface SettingEntry {
  key: string;
  value: string;
}

export interface PaymentsConfig {
  paymentsEnabled: boolean;
  source: "env" | "db";
}

export interface GrantHistoryRecord {
  id: number;
  chatId: number;
  type: "credits" | "subscription" | "subscription_revoked";
  amount: number;
  grantedBy: number;
  createdAt: number;
}

export interface GrantHistoryResponse {
  history: GrantHistoryRecord[];
  total?: number;
}

export type DownloadTrackStatus = "pending" | "sent" | "failed";
export type DownloadStatus = "pending" | "processing" | "done" | "partial" | "failed";

export interface DownloadTrack {
  uri: string;
  title: string;
  artist: string;
  durationMs?: number;
  status: DownloadTrackStatus;
  error?: string;
}

export interface DownloadRecord {
  id: number;
  chatId: number;
  playlistName: string;
  tracks: DownloadTrack[];
  status: DownloadStatus;
  createdAt: number;
}

/**
 * Streaming URL for <audio src>: audio elements cannot set headers, so the
 * signed initData rides in the query string (accepted by requireAuth).
 */
export function streamUrl(uri: string): string {
  return `/api/stream/${encodeURIComponent(uri)}?initData=${encodeURIComponent(getInitData())}`;
}

export type TrackVerificationStatus = "pending" | "checking" | "verified" | "unavailable";

/**
 * Reads a text/event-stream response body and dispatches each frame. Progress
 * frames call onProgress; the terminal "outcome" frame resolves the promise.
 * Uses fetch (not EventSource) so the initData header can ride along.
 */
async function requestSSE<T>(path: string, body: unknown, onProgress: (text: string) => void): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Telegram-Init-Data": getInitData() },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const parsed = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(parsed.error ?? `request failed: ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const parsed = JSON.parse(line.slice(5).trim()) as { type: string; text?: string; outcome?: T };
      if (parsed.type === "progress" && parsed.text) onProgress(parsed.text);
      else if (parsed.type === "outcome") return parsed.outcome as T;
    }
  }
  throw new Error("stream ended without an outcome");
}

export const api = {
  me: () => request<MeResponse>("/api/me"),

  // --- Audio downloads ---
  download: (playlistName: string, tracks: Track[]) =>
    request<{ downloadId: number }>("/api/download", {
      method: "POST",
      body: JSON.stringify({
        playlistName,
        tracks: tracks.map(({ uri, title, artist, durationMs }) => ({ uri, title, artist, durationMs })),
      }),
    }),
  downloads: () => request<{ downloads: DownloadRecord[] }>("/api/downloads"),
  resendDownload: (id: number) =>
    request<{ downloadId: number }>(`/api/downloads/${id}/resend`, { method: "POST" }),
  deleteDownload: (id: number) => request<{ ok: boolean }>(`/api/downloads/${id}`, { method: "DELETE" }),
  generate: (prompt: string) =>
    request<GenerateOutcome>("/api/generate", { method: "POST", body: JSON.stringify({ prompt }) }),
  generateResume: (answer: string) =>
    request<GenerateOutcome>("/api/generate/resume", { method: "POST", body: JSON.stringify({ answer }) }),
  generateStream: (prompt: string, onProgress: (text: string) => void) =>
    requestSSE<GenerateOutcome>("/api/generate/stream", { prompt }, onProgress),
  generateResumeStream: (answer: string, onProgress: (text: string) => void) =>
    requestSSE<GenerateOutcome>("/api/generate/resume/stream", { answer }, onProgress),
  adminSettings: () => request<AdminSettings>("/api/admin/settings"),
  setActiveProvider: (id: string) =>
    request<{ activeProvider: string }>("/api/admin/settings/provider", { method: "POST", body: JSON.stringify({ id }) }),
  setActiveBackend: (id: string) =>
    request<{ activeBackend: string }>("/api/admin/settings/backend", { method: "POST", body: JSON.stringify({ id }) }),

  // --- Shop config (public, no admin rights) ---
  shopConfig: () => request<ShopConfig>("/api/shop-config"),

  verifyTracks: (uris: string[]) =>
    request<Record<string, TrackVerificationStatus>>(`/api/tracks/verify?uris=${encodeURIComponent(uris.join(","))}`),

  // --- Payments ---
  offers: () => request<{ offers: Offer[] }>("/api/offers"),
  createInvoice: (offerId: number, method: PaymentMethod = "crypto") =>
    request<InvoiceResult>("/api/invoices", { method: "POST", body: JSON.stringify({ offerId, method }) }),
  purchases: () => request<{ purchases: Invoice[] }>("/api/me/purchases"),
  claimTrial: () => request<{ trial: TrialStatus }>("/api/trial/claim", { method: "POST" }),

  // --- Admin: payments management ---
  adminStats: () => request<AdminStats>("/api/admin/stats"),
  adminOffers: () => request<{ offers: Offer[] }>("/api/admin/offers"),
  adminCreateOffer: (input: OfferInput) =>
    request<{ offer: Offer }>("/api/admin/offers", { method: "POST", body: JSON.stringify(input) }),
  adminUpdateOffer: (id: number, patch: Partial<OfferInput>) =>
    request<{ offer: Offer }>(`/api/admin/offers/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  adminDeleteOffer: (id: number) =>
    request<{ ok: boolean }>(`/api/admin/offers/${id}`, { method: "DELETE" }),
  adminBroadcast: (text: string) =>
    request<{ sent: number; failed: number }>("/api/admin/broadcast", { method: "POST", body: JSON.stringify({ text }) }),
  adminShopSettings: () => request<ShopSettings>("/api/admin/shop-settings"),
  adminSetShopSettings: (patch: Partial<ShopSettings>) =>
    request<ShopSettings>("/api/admin/shop-settings", { method: "POST", body: JSON.stringify(patch) }),

  // --- Admin: user management ---
  adminUsers: () => request<{ users: AdminUser[] }>("/api/admin/users"),
  adminGrantCredits: (chatId: number, amount: number) =>
    request<{ credits: number }>(`/api/admin/users/${chatId}/credits`, { method: "POST", body: JSON.stringify({ amount }) }),
  adminExtendSubscription: (chatId: number, days: number) =>
    request<{ subscriptionUntil: number | null }>(`/api/admin/users/${chatId}/subscription`, { method: "POST", body: JSON.stringify({ days }) }),

  // --- Admin: grant history ---
  adminGrantHistory: (chatId?: number) =>
    request<GrantHistoryResponse>(`/api/admin/grant-history${chatId ? `?chatId=${chatId}` : ""}`),
  adminRevokeSubscription: (chatId: number) =>
    request<{ ok: boolean }>(`/api/admin/users/${chatId}/subscription`, { method: "DELETE" }),

  // --- Admin: access control ---
  adminAccess: () => request<{ entries: AllowlistEntry[] }>("/api/admin/access"),
  adminAccessAdd: (chatId: number, isAdmin?: boolean) =>
    request<{ ok: boolean }>("/api/admin/access/add", { method: "POST", body: JSON.stringify({ chatId, isAdmin }) }),
  adminAccessRemove: (chatId: number) =>
    request<{ ok: boolean }>("/api/admin/access/remove", { method: "POST", body: JSON.stringify({ chatId }) }),
  adminAccessSetRole: (chatId: number, isAdmin: boolean) =>
    request<{ ok: boolean }>("/api/admin/access/set-role", { method: "POST", body: JSON.stringify({ chatId, isAdmin }) }),

  // --- Admin: provider config ---
  adminProviderConfig: () => request<{ providers: ProviderConfigEntry[] }>("/api/admin/provider-config"),
  adminUpdateProviderConfig: (id: string, overrides: { model?: string | null; baseUrl?: string | null }) =>
    request<ProviderConfigEntry>(`/api/admin/provider-config/${id}`, { method: "POST", body: JSON.stringify(overrides) }),

  // --- Admin: unified settings ---
  adminAllSettings: () => request<{ settings: SettingEntry[] }>("/api/admin/all-settings"),
  adminCreateSetting: (key: string, value: string) =>
    request<{ ok: boolean }>("/api/admin/all-settings", { method: "POST", body: JSON.stringify({ key, value }) }),
  adminUpdateSetting: (key: string, value: string | null) =>
    request<{ ok: boolean }>(`/api/admin/all-settings/${encodeURIComponent(key)}`, { method: "POST", body: JSON.stringify({ value }) }),

  // --- Admin: payments toggle ---
  adminPaymentsConfig: () => request<PaymentsConfig>("/api/admin/payments-config"),
  adminSetPaymentsConfig: (paymentsEnabled: boolean | null) =>
    request<{ ok: boolean }>("/api/admin/payments-config", { method: "POST", body: JSON.stringify({ paymentsEnabled }) }),
};
