import { getTelegramWebApp } from "./telegram";

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
