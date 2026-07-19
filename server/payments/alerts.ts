import type { AppDb } from "../db";
import { env } from "../env";
import { getUser } from "../access/users-store";
import type { FulfillResult } from "./fulfillment";

const PROVIDER_LABELS: Record<string, string> = {
  crypto: "CryptoBot",
  stars: "Telegram Stars",
  platega: "Platega СБП",
};

function grantLabel(kind: string | undefined, amount: number | undefined): string {
  if (!kind || amount === undefined) return "—";
  return kind === "subscription" ? `подписка ${amount} дн.` : `${amount} генераций`;
}

/**
 * Notifies admins of a fulfilled top-up via the separate alert bot. No-op
 * unless fulfillment succeeded and the alert bot is configured. Never throws —
 * a failed alert must not block the payment path that triggered it.
 */
/**
 * Notifies admins of a brand-new user via the alert bot. No-op unless the
 * alert bot is configured. Never throws.
 */
export async function alertNewUser(chatId: number, username?: string | null): Promise<void> {
  if (!env.alertBotToken || env.alertChatIds.length === 0) return;

  try {
    const who = username ? `@${username} (${chatId})` : `${chatId}`;
    const text = `🆕 <b>Новый пользователь</b>\n${who}`;

    await Promise.all(
      env.alertChatIds.map((alertChatId) =>
        fetch(`https://api.telegram.org/bot${env.alertBotToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: alertChatId, text, parse_mode: "HTML" }),
        }).catch(() => {}),
      ),
    );
  } catch {
    // Alerts must never break the request path that triggered them.
  }
}

export async function alertPaymentFulfilled(db: AppDb, result: FulfillResult): Promise<void> {
  if (!result.fulfilled || !result.chatId) return;
  if (!env.alertBotToken || env.alertChatIds.length === 0) return;

  try {
    const user = getUser(db, result.chatId);
    const who = user?.username ? `@${user.username} (${result.chatId})` : `${result.chatId}`;
    const provider = PROVIDER_LABELS[result.provider ?? ""] ?? result.provider ?? "неизвестно";
    const text =
      `💰 <b>Новый платёж</b>\n` +
      `Провайдер: ${provider}\n` +
      `Покупатель: ${who}\n` +
      `Оффер: ${result.offerTitle ?? "—"}\n` +
      `Сумма: ${result.amount ?? "—"} ${result.asset ?? ""}\n` +
      `Начислено: ${grantLabel(result.grantKind, result.grantAmount)}`;

    await Promise.all(
      env.alertChatIds.map((chatId) =>
        fetch(`https://api.telegram.org/bot${env.alertBotToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
        }).catch(() => {}),
      ),
    );
  } catch {
    // Alerts must never break the payment path.
  }
}
