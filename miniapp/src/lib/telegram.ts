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
  onEvent(event: string, handler: () => void): void;
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

export function getInitData(): string {
  return getTelegramWebApp()?.initData ?? "";
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
