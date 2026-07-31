interface BackButton {
  isVisible: boolean;
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}

interface TelegramWebApp {
  initData: string;
  colorScheme: "light" | "dark";
  themeParams: Record<string, string>;
  ready(): void;
  expand(): void;
  requestFullscreen?(): void;
  exitFullscreen?(): void;
  disableVerticalSwipes?(): void;
  enableVerticalSwipes?(): void;
  onEvent(event: string, handler: () => void): void;
  offEvent?(event: string, handler: () => void): void;
  openLink(url: string): void;
  openTelegramLink(url: string): void;
  openInvoice?(url: string, callback?: (status: InvoiceStatus) => void): void;
  BackButton?: BackButton;
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
}

export type InvoiceStatus = "paid" | "cancelled" | "failed" | "pending";

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

/**
 * Runs a Bot-API-version-gated WebApp call (requestFullscreen,
 * disableVerticalSwipes, ...) without risking the whole app. The `?.()`
 * pattern only guards against the method being *absent*; on the real
 * WebView SDK these methods exist on every client but *throw*
 * `WebAppMethodUnsupported` synchronously when the client's Bot API version
 * doesn't support them yet — uncaught, that unmounts the whole React tree.
 * Takes a thunk (not the bare method) so the call stays bound to `webApp`
 * — the real SDK's version check reads `this` internally.
 */
export function callIfSupported(call: () => void): void {
  try {
    call();
  } catch {
    // Unsupported on this client's Bot API version — ignore.
  }
}

export function getInitData(): string {
  return getTelegramWebApp()?.initData ?? "";
}

let inlineAuthToken: string | null | undefined;

/** Signed fallback supplied only when Telegram opens the app from inline results. */
export function getInlineAuthToken(): string {
  if (inlineAuthToken !== undefined) return inlineAuthToken ?? "";
  const href = window.location?.href;
  if (!href) return (inlineAuthToken = "");
  const url = new URL(href);
  inlineAuthToken = url.searchParams.get("inlineAuth");
  if (inlineAuthToken) {
    url.searchParams.delete("inlineAuth");
    window.history?.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }
  return inlineAuthToken ?? "";
}

/** First name from signed initData's `user` payload; null outside Telegram or on parse failure. */
export function getTelegramUserFirstName(): string | null {
  try {
    const raw = new URLSearchParams(getInitData()).get("user");
    if (!raw) return null;
    const user = JSON.parse(raw) as { first_name?: string };
    return user.first_name?.trim() || null;
  } catch {
    return null;
  }
}

export function getColorScheme(): "light" | "dark" {
  return getTelegramWebApp()?.colorScheme ?? "dark";
}

/**
 * Opens a Telegram Stars invoice link inside the Mini App. Falls back to
 * openPayUrl on old clients without openInvoice (payment still completes;
 * only the in-app close callback is lost).
 */
export function openStarsInvoice(url: string, onClosed?: (status: InvoiceStatus) => void): void {
  const webApp = getTelegramWebApp();
  if (webApp?.openInvoice) {
    webApp.openInvoice(url, onClosed);
    return;
  }
  openPayUrl(url);
}

/** Opens a Crypto Pay pay URL; t.me links use openTelegramLink, else openLink. */
export function openPayUrl(url: string): void {
  const webApp = getTelegramWebApp();
  if (!webApp) {
    window.open(url, "_blank");
    return;
  }
  if (/^https?:\/\/t\.me\//i.test(url)) webApp.openTelegramLink(url);
  else webApp.openLink(url);
}

/**
 * Opens the configured support contact. Accepts a username (@handle, t.me/...),
 * a bare handle, or any URL. Falls back to opening in a new tab.
 */
export function normalizeSupportContact(contact: string): { url: string; telegram: boolean } | null {
  const trimmed = (contact ?? "").trim();
  if (!trimmed) return null;
  if (/^https?:\/\/(?:www\.)?(?:t\.me|telegram\.me)\//i.test(trimmed)) {
    const handle = trimmed.replace(/^https?:\/\/(?:www\.)?(?:t\.me|telegram\.me)\//i, "").replace(/^@/, "");
    return { url: `https://t.me/${handle}`, telegram: true };
  }
  if (/^@?[a-zA-Z0-9_]{5,}$/.test(trimmed)) {
    return { url: `https://t.me/${trimmed.replace(/^@/, "")}`, telegram: true };
  }
  return { url: trimmed, telegram: false };
}

export function openSupport(contact: string): void {
  const target = normalizeSupportContact(contact);
  if (!target) return;
  const webApp = getTelegramWebApp();
  if (!webApp) {
    window.open(target.url, "_blank");
    return;
  }
  if (target.telegram) webApp.openTelegramLink(target.url);
  else webApp.openLink(target.url);
}
