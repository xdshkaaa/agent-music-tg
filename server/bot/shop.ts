import { Bot, InlineKeyboard } from "grammy";
import type { AppDb } from "../db";
import type { BotContext } from "./context";
import { listActiveOffers, getOffer, type Offer } from "../payments/offers-store";
import { listInvoicesForChat } from "../payments/invoices-store";
import { getUser, claimTrial, TRIAL_CREDITS, TRIAL_DAYS } from "../access/users-store";
import { trialActive } from "../access/entitlements";
import { purchaseOffer, OfferUnavailableError } from "../payments/purchase";
import { fulfillStarsPayment, parseStarsPayload, type StarsPayload } from "../payments/stars";
import { btnText, heading, accent } from "./emoji";
import { getShopSettings, getPaymentsEnabled } from "../lib/settings";
import { env } from "../env";

function offerSymbol(o: Offer): string {
  return o.grantKind === "subscription" ? "ruler" : "music";
}

function offerLabel(o: Offer): string {
  const grant = o.grantKind === "subscription" ? `${o.grantAmount} дн. подписки` : `${o.grantAmount} генераций`;
  const price = o.starsAmount ? `${o.amount} ${o.asset} / ${o.starsAmount} Stars` : `${o.amount} ${o.asset}`;
  return `${o.title} — ${price} (${grant})`;
}

/**
 * Inline keyboard of active offers; empty state handled by caller. The free
 * trial button leads the list until this chat has claimed it.
 */
export function offersKeyboard(db: AppDb, chatId: number): InlineKeyboard | null {
  const offers = listActiveOffers(db);
  const trialAvailable = getUser(db, chatId)?.trialClaimedAt == null;
  if (offers.length === 0 && !trialAvailable) return null;
  const kb = new InlineKeyboard();
  if (trialAvailable) kb.text(btnText(`Бесплатный пакет — ${TRIAL_CREDITS} генераций на ${TRIAL_DAYS} дня`, "gift"), "trial:claim").row();
  for (const o of offers) {
    kb.text(btnText(offerLabel(o), offerSymbol(o)), `buy:${o.id}`).row();
  }
  return kb;
}

export function purchasePromptText(): string {
  // Sent with parse_mode: "HTML" by sendOffers below.
  return `<b>${heading("ruler", "ДОСТУП")}</b>\nЧтобы генерировать плейлисты, нужен доступ. Выберите пакет:`;
}

/** Sends the offer list (used by /buy and by the no-access prompt). */
export async function sendOffers(ctx: BotContext, db: AppDb, header: string): Promise<void> {
  const kb = offersKeyboard(db, ctx.chat!.id);
  if (!kb) {
    await ctx.reply("Пакеты пока не настроены. Загляните позже.");
    return;
  }
  await ctx.reply(header, { reply_markup: kb, parse_mode: "HTML" });
}

function formatSubscription(until: number | null): string {
  if (!until) return "нет";
  const now = Math.floor(Date.now() / 1000);
  if (until <= now) return "истекла";
  return new Date(until * 1000).toLocaleDateString("ru-RU");
}

export async function showProfile(ctx: BotContext, db: AppDb): Promise<void> {
  const chatId = ctx.chat!.id;
  const user = getUser(db, chatId);
  const purchases = listInvoicesForChat(db, chatId).filter((i) => i.status === "paid");
  const wallet = accent("wallet");
  const ruler = accent("ruler");
  const pkg = accent("package");
  const gift = accent("gift");
  const lines = [
    `<b>${heading("profile", "ПРОФИЛЬ")}</b>`,
    `${wallet ? wallet + " " : ""}Генерации: ${user?.credits ?? 0}`,
    ...(trialActive(user)
      ? [`${gift ? gift + " " : ""}Бесплатный пакет: ${user!.trialCredits} ген. до ${new Date(user!.trialUntil! * 1000).toLocaleDateString("ru-RU")}`]
      : []),
    `${ruler ? ruler + " " : ""}Подписка: ${formatSubscription(user?.subscriptionUntil ?? null)}`,
    "",
    `${pkg ? pkg + " " : ""}Покупок: ${purchases.length}`,
  ];
  if (purchases.length > 0) {
    for (const p of purchases.slice(0, 10)) {
      lines.push(`• #${p.id}: ${p.amount} ${p.asset === "XTR" ? "Stars" : p.asset}`);
    }
  }
  const shop = getShopSettings(db);
  if (shop.supportContact) {
    lines.push("", `Поддержка: ${shop.supportContact}`);
  }
  const text = lines.join("\n");
  if (user?.photoFileId) {
    try {
      await ctx.replyWithPhoto(user.photoFileId, { caption: text, parse_mode: "HTML" });
    } catch {
      await ctx.reply(text, { parse_mode: "HTML" });
    }
  } else {
    await ctx.reply(text, { parse_mode: "HTML" });
  }
}

/** Registers /buy, /profile and the buy:<id> callback handler. */
export function registerShop(bot: Bot<BotContext>, db: AppDb): void {
  bot.command("buy", async (ctx) => {
    await sendOffers(ctx, db, purchasePromptText());
  });

  bot.command("profile", async (ctx) => {
    await showProfile(ctx, db);
  });

  async function startCryptoPurchase(ctx: BotContext, offerId: number): Promise<void> {
    try {
      const result = await purchaseOffer(db, ctx.chat!.id, offerId);
      const kb = new InlineKeyboard().url("Оплатить", result.payUrl);
      await ctx.reply(`Счёт на «${result.offerTitle}» создан. Оплатите по кнопке ниже — доступ активируется автоматически.`, {
        reply_markup: kb,
      });
    } catch (e) {
      if (e instanceof OfferUnavailableError) {
        await ctx.reply("Этот пакет больше недоступен.");
        return;
      }
      await ctx.reply(`Не удалось создать счёт: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function startStarsPurchase(ctx: BotContext, offerId: number): Promise<void> {
    const offer = getOffer(db, offerId);
    if (!offer || !offer.active || !offer.starsAmount) {
      await ctx.reply("Этот пакет больше недоступен.");
      return;
    }
    const payload: StarsPayload = { chatId: ctx.chat!.id, offerId: offer.id };
    await ctx.replyWithInvoice(offer.title, offerLabel(offer), JSON.stringify(payload), "XTR", [
      { label: offer.title, amount: offer.starsAmount },
    ]);
  }

  bot.callbackQuery("trial:claim", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!getPaymentsEnabled(db, env.paymentsEnabled)) {
      await ctx.reply("Магазин временно недоступен.");
      return;
    }
    if (claimTrial(db, ctx.chat!.id)) {
      const check = accent("check");
      await ctx.reply(`${check ? check + " " : ""}Бесплатный пакет активирован: ${TRIAL_CREDITS} генераций на ${TRIAL_DAYS} дня.`, { parse_mode: "HTML" });
      try {
        await ctx.editMessageReplyMarkup({ reply_markup: offersKeyboard(db, ctx.chat!.id) ?? new InlineKeyboard() });
      } catch { /* message too old to edit */ }
    } else {
      await ctx.reply("Бесплатный пакет уже был активирован.");
    }
  });

  bot.callbackQuery(/^buy:(\d+)$/, async (ctx) => {
    const offerId = Number(ctx.match[1]);
    await ctx.answerCallbackQuery();
    const offer = getOffer(db, offerId);
    if (!offer || !offer.active) {
      await ctx.reply("Этот пакет больше недоступен.");
      return;
    }
    if (!offer.starsAmount) {
      await startCryptoPurchase(ctx, offerId);
      return;
    }
    const kb = new InlineKeyboard()
      .text(`Криптой — ${offer.amount} ${offer.asset}`, `buyc:${offerId}`)
      .row()
      .text(btnText(`Stars — ${offer.starsAmount}`, "star"), `buys:${offerId}`);
    await ctx.reply(`«${offer.title}» — выберите способ оплаты:`, { reply_markup: kb });
  });

  bot.callbackQuery(/^buyc:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await startCryptoPurchase(ctx, Number(ctx.match[1]));
  });

  bot.callbackQuery(/^buys:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await startStarsPurchase(ctx, Number(ctx.match[1]));
  });

  // Telegram re-validates every Stars checkout here; must answer within 10s.
  bot.on("pre_checkout_query", async (ctx) => {
    const payload = parseStarsPayload(ctx.preCheckoutQuery.invoice_payload);
    const offer = payload ? getOffer(db, payload.offerId) : null;
    if (!payload || !offer || !offer.active || !offer.starsAmount) {
      await ctx.answerPreCheckoutQuery(false, "Этот пакет больше недоступен.");
      return;
    }
    await ctx.answerPreCheckoutQuery(true);
  });

  bot.on("message:successful_payment", async (ctx) => {
    const sp = ctx.message.successful_payment;
    const payload = parseStarsPayload(sp.invoice_payload);
    if (!payload) return;
    const result = fulfillStarsPayment(db, {
      chargeId: sp.telegram_payment_charge_id,
      chatId: payload.chatId,
      offerId: payload.offerId,
      starsAmount: sp.total_amount,
    });
    if (result.fulfilled) {
      const check = accent("check");
      await ctx.reply(
        result.offerTitle
          ? `${check ? check + " " : ""}Оплата получена: «${result.offerTitle}». Доступ активирован.`
          : `${check ? check + " " : ""}Оплата получена. Доступ активирован.`,
        { parse_mode: "HTML" },
      );
    }
  });
}
