import { getTelegramWebApp } from "./telegram";

/**
 * Accepts both forms a share token reaches the app in: the bot's web_app
 * button passes it bare in `?share=`, while an app opened through `startapp`
 * gets Telegram's `pl_`-prefixed start_param. Anything else — a referral or
 * UTM payload — is not ours and returns null.
 */
export function parseShareToken(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  const match = /^(?:pl_)?([A-Za-z0-9]{10})$/.exec(value);
  return match ? match[1]! : null;
}

/**
 * Opens Telegram's share sheet on a link. This is the guaranteed path — it
 * needs no Bot API version floor and no inline mode, and it is the same
 * mechanism the bot's referral button already uses.
 */
export function shareUrlToChat(url: string, text: string): void {
  const target = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  const webApp = getTelegramWebApp();
  if (webApp?.openTelegramLink) {
    webApp.openTelegramLink(target);
    return;
  }
  window.open(target, "_blank");
}
