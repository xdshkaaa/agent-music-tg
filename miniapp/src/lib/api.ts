import { getInitData } from "./telegram";
import type { AgentEvent } from "./reasoning";

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
  musicBackend: string | null;
}

export type GrantKind = "credits" | "subscription";

export interface Offer {
  id: number;
  title: string;
  amount: string;
  asset: string;
  starsAmount: number | null;
  rubAmount: number | null;
  icon: string | null;
  active: boolean;
  grantKind: GrantKind;
  grantAmount: number;
}

export type PaymentMethod = "stars" | "platega";

export interface Invoice {
  id: number;
  provider: PaymentMethod;
  externalId: string;
  chatId: number;
  offerId: number;
  amount: string;
  asset: string;
  status: "pending" | "paid" | "canceled";
  createdAt: number;
  paidAt: number | null;
}

export interface InvoiceResult {
  id: number;
  payUrl: string;
  offerTitle: string;
  method: PaymentMethod;
}

export type StatsPeriod = "today" | "week" | "month" | "all";

export interface AdminStats {
  period: StatsPeriod;
  totalUsers: number;
  newUsers: number;
  activeSubscriptions: number;
  paidPurchases: number;
  revenue: { asset: string; total: number }[];
  revenueAllTime: { asset: string; total: number }[];
  conversionRate: number | null;
  topOffers: { title: string; count: number }[];
  topActiveUsers: { chatId: number; username: string | null; generations: number }[];
  segments: {
    activeSubscription: number;
    trialActive: number;
    payingNoSubscription: number;
    freeNoActivity: number;
  };
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
  rubAmount?: number | null;
  icon?: string | null;
  active?: boolean;
  grantKind: GrantKind;
  grantAmount: number;
}

export interface ShopConfig {
  headerIcon: string;
  headerTitle: string;
  supportContact: string;
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

export interface Album {
  uri: string;
  title: string;
  artist: string;
  artwork?: string;
  deepLink?: string;
}

export interface FinalizedPlaylist {
  name: string;
  tracks: Track[];
  remotePlaylistUrl?: string;
}

export type GenerateOutcome =
  | { status: "ok"; playlist: FinalizedPlaylist; generationId: number }
  | { status: "clarify"; question: string; options: string[] }
  | { status: "needs_purchase" }
  | { status: "rate_limited"; retryAt: number }
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

export interface SavedTrack {
  uri: string;
  title: string;
  artist: string;
  artwork: string | null;
  createdAt: number;
}

export interface ArtistCard {
  id: string;
  name: string;
  artwork?: string;
}

export interface ArtistDetail {
  id: string;
  name: string;
  artwork?: string;
  topTracks: Track[];
  albums: Album[];
}

export type LyricsResult =
  | { status: "synced"; lines: { t: number; line: string }[] }
  | { status: "plain"; text: string }
  | { status: "notFound" };

export interface Playlist {
  id: number;
  name: string;
  createdAt: number;
  trackCount: number;
}

export interface PlaylistTrack {
  uri: string;
  title: string;
  artist: string;
  artwork: string | null;
  createdAt: number;
}

export interface PlaylistDetail extends Playlist {
  tracks: PlaylistTrack[];
}

export class PlaylistLimitReachedError extends Error {
  constructor(
    public readonly limit: number,
    public readonly starsPrice: number,
  ) {
    super("playlist limit reached");
  }
}

export interface HistoryEntry {
  id: number;
  prompt: string;
  playlistName: string | null;
  trackCount: number | null;
  tracks: Track[];
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
 * Reads a text/event-stream response body and dispatches each frame. Agent
 * events call onEvent; the terminal "outcome" frame resolves the promise.
 * Uses fetch (not EventSource) so the initData header can ride along.
 */
async function requestSSE<T>(path: string, body: unknown, onEvent: (e: AgentEvent) => void): Promise<T> {
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
      const parsed = JSON.parse(line.slice(5).trim()) as { type: string; event?: AgentEvent; outcome?: T };
      if (parsed.type === "agent_event" && parsed.event) onEvent(parsed.event);
      else if (parsed.type === "outcome") return parsed.outcome as T;
    }
  }
  throw new Error("stream ended without an outcome");
}

export const api = {
  me: () => request<MeResponse>("/api/me"),
  setMyMusicBackend: (id: string | null) =>
    request<{ ok: boolean; musicBackend: string | null }>("/api/me/music-backend", {
      method: "POST",
      body: JSON.stringify({ id }),
    }),

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
  generateStream: (prompt: string, onEvent: (e: AgentEvent) => void) =>
    requestSSE<GenerateOutcome>("/api/generate/stream", { prompt }, onEvent),
  generateResumeStream: (answer: string, onEvent: (e: AgentEvent) => void) =>
    requestSSE<GenerateOutcome>("/api/generate/resume/stream", { answer }, onEvent),
  extendStream: (generationId: number, prompt: string, onEvent: (e: AgentEvent) => void) =>
    requestSSE<GenerateOutcome>("/api/generate/extend/stream", { generationId, prompt }, onEvent),
  adminSettings: () => request<AdminSettings>("/api/admin/settings"),
  setActiveProvider: (id: string) =>
    request<{ activeProvider: string }>("/api/admin/settings/provider", { method: "POST", body: JSON.stringify({ id }) }),
  setActiveBackend: (id: string) =>
    request<{ activeBackend: string }>("/api/admin/settings/backend", { method: "POST", body: JSON.stringify({ id }) }),

  // --- Shop config (public, no admin rights) ---
  shopConfig: () => request<ShopConfig>("/api/shop-config"),

  search: (query: string, limit = 20) =>
    request<{ tracks: Track[]; artists: ArtistCard[] }>(`/api/search?q=${encodeURIComponent(query)}&limit=${limit}`),
  searchAlbums: (query: string, limit = 20) =>
    request<{ albums: Album[] }>(`/api/search/albums?q=${encodeURIComponent(query)}&limit=${limit}`),
  albumTracks: (uri: string, limit = 30) =>
    request<{ tracks: Track[] }>(`/api/search/album-tracks?uri=${encodeURIComponent(uri)}&limit=${limit}`),

  artist: (query: { id?: string; name?: string }) => {
    const params = new URLSearchParams();
    if (query.id) params.set("id", query.id);
    if (query.name) params.set("name", query.name);
    return request<ArtistDetail>(`/api/artist?${params.toString()}`);
  },

  lyrics: (artist: string, title: string, durationSec?: number) => {
    const params = new URLSearchParams({ artist, title });
    if (durationSec) params.set("duration", String(Math.round(durationSec)));
    return request<LyricsResult>(`/api/lyrics?${params.toString()}`);
  },

  // --- Player reactions ---
  reactionStatus: (uri: string) =>
    request<{ liked: boolean; disliked: boolean }>(`/api/reactions/status?uri=${encodeURIComponent(uri)}`),
  dislikeTrack: (track: { uri: string; title: string; artist: string }) =>
    request<{ ok: boolean }>("/api/reactions/dislike", { method: "POST", body: JSON.stringify(track) }),
  undislikeTrack: (uri: string) =>
    request<{ ok: boolean }>(`/api/reactions/dislike/${encodeURIComponent(uri)}`, { method: "DELETE" }),

  // --- Playlists ("Музыка") ---
  playlists: () => request<{ playlists: Playlist[]; limit: number }>("/api/playlists"),
  playlist: (id: number) => request<{ playlist: PlaylistDetail }>(`/api/playlists/${id}`),
  createPlaylist: async (name: string) => {
    const res = await fetch("/api/playlists", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Telegram-Init-Data": getInitData() },
      body: JSON.stringify({ name }),
    });
    if (res.status === 403) {
      const body = (await res.json().catch(() => ({}))) as { limit?: number; starsPrice?: number };
      throw new PlaylistLimitReachedError(body.limit ?? 2, body.starsPrice ?? 5);
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error ?? `request failed: ${res.status}`);
    }
    return res.json() as Promise<{ playlist: Playlist }>;
  },
  renamePlaylist: (id: number, name: string) =>
    request<{ ok: boolean }>(`/api/playlists/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  deletePlaylist: (id: number) => request<{ ok: boolean }>(`/api/playlists/${id}`, { method: "DELETE" }),
  addTrackToPlaylist: async (id: number, track: { uri: string; title: string; artist: string; artwork?: string | null }) => {
    const res = await fetch(`/api/playlists/${id}/tracks`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Telegram-Init-Data": getInitData() },
      body: JSON.stringify(track),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error ?? `request failed: ${res.status}`);
    }
    return res.json() as Promise<{ ok: boolean; duplicate: boolean }>;
  },
  removeTrackFromPlaylist: (id: number, uri: string) =>
    request<{ ok: boolean }>(`/api/playlists/${id}/tracks/${encodeURIComponent(uri)}`, { method: "DELETE" }),
  buyPlaylistSlots: (slots = 1) =>
    request<{ payUrl: string }>("/api/playlists/slots/invoice", { method: "POST", body: JSON.stringify({ slots }) }),

  verifyTracks: (uris: string[]) =>
    request<Record<string, TrackVerificationStatus>>(`/api/tracks/verify?uris=${encodeURIComponent(uris.join(","))}`),

  // --- Payments ---
  offers: () => request<{ offers: Offer[] }>("/api/offers"),
  createInvoice: (offerId: number, method: PaymentMethod = "stars") =>
    request<InvoiceResult>("/api/invoices", { method: "POST", body: JSON.stringify({ offerId, method }) }),
  cancelInvoice: (id: number) =>
    request<{ ok: boolean; canceled?: boolean; refundedCredits?: number }>(`/api/invoices/${id}/cancel`, {
      method: "POST",
    }),
  purchases: () => request<{ purchases: Invoice[] }>("/api/me/purchases"),
  claimTrial: () => request<{ trial: TrialStatus }>("/api/trial/claim", { method: "POST" }),

  // --- Playlist history ---
  saveGeneration: (id: number) => request<{ ok: boolean }>(`/api/generations/${id}/save`, { method: "POST" }),
  unsaveGeneration: (id: number) => request<{ ok: boolean }>(`/api/generations/${id}/save`, { method: "DELETE" }),
  renameGeneration: (id: number, name: string) =>
    request<{ ok: boolean }>(`/api/generations/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  fetchHistory: () => request<{ history: HistoryEntry[] }>("/api/history"),

  // --- Saved tracks ("Плейлисты") ---
  myMusic: () => request<{ tracks: SavedTrack[] }>("/api/my-music"),
  addMyMusic: (track: { uri: string; title: string; artist: string; artwork?: string | null }) =>
    request<{ ok: boolean }>("/api/my-music", { method: "POST", body: JSON.stringify(track) }),
  removeMyMusic: (uri: string) =>
    request<{ ok: boolean }>(`/api/my-music/${encodeURIComponent(uri)}`, { method: "DELETE" }),

  // --- Admin: payments management ---
  adminStats: (period: StatsPeriod = "all") => request<AdminStats>(`/api/admin/stats?period=${period}`),
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
  adminAccessConfig: () => request<{ openAccess: boolean }>("/api/admin/access-config"),
  adminSetAccessConfig: (openAccess: boolean) =>
    request<{ ok: boolean }>("/api/admin/access-config", { method: "POST", body: JSON.stringify({ openAccess }) }),
  adminPaymentsConfig: () => request<PaymentsConfig>("/api/admin/payments-config"),
  adminSetPaymentsConfig: (paymentsEnabled: boolean | null) =>
    request<{ ok: boolean }>("/api/admin/payments-config", { method: "POST", body: JSON.stringify({ paymentsEnabled }) }),
};
