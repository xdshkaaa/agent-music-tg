import { Bot, InlineKeyboard } from "grammy";
import type { AppDb } from "../db";
import { env } from "../env";
import type { BotContext } from "./context";
import { allowlistGate } from "./middleware";
import { channelSubscriptionGate } from "./channel-subscription-gate";
import { AVAILABLE_PROVIDERS, isProviderId } from "../agent/registry";
import { AVAILABLE_BACKENDS, isMusicBackend } from "../music/registry";
import { getActiveProviderId, setActiveProviderId, getActiveBackendId, setActiveBackendId, getShopSettings } from "../lib/settings";
import { upsertUser, setPhotoFileId } from "../access/users-store";
import { alertNewUser } from "../payments/alerts";
import { registerShop, buildProfileView, buildBuyView, type ShopView } from "./shop";
import { registerAdminPanel, handleAdminText, menuKeyboard } from "./admin-panel";
import { registerCredits } from "./credits";
import { registerModel } from "./model";
import { registerReset } from "./reset";
import { registerHistory, buildHistoryView } from "./history";
import { registerReferral, buildReferralView, applyReferral } from "./referral";
import { btnText, heading } from "./emoji";
import { grantPlaylistSlotsForPayment } from "../access/stars-payments-store";

export function createBot(db: AppDb): Bot<BotContext> {
  const bot = new Bot<BotContext>(env.telegramBotToken);
  bot.catch((err) => {
    console.error(`Bot handler error for update ${err.ctx.update.update_id}:`, err.error);
  });
  bot.use(allowlistGate(db));
  bot.use(channelSubscriptionGate(db));

  const send = async (chatId: number, text: string): Promise<void> => {
    await bot.api.sendMessage(chatId, text);
  };

  function buildStartKeyboard(ctx: BotContext): InlineKeyboard {
    const kb = new InlineKeyboard()
      .webApp(btnText("Открыть приложение", "app"), env.publicOrigin).row()
      // Deep-link into a specific screen. Uses the same inline webApp button
      // type as "Открыть приложение" — a persistent reply-keyboard's webApp
      // buttons don't reliably deliver initData on all Telegram clients,
      // which broke auth for these shortcuts.
      .webApp(btnText("Поиск", "search"), `${env.publicOrigin}?tab=create&mode=search`)
      .webApp(btnText("Мои плейлисты", "music"), `${env.publicOrigin}?tab=playlists`).row()
      .text(btnText("Купить", "money"), "nav:buy")
      .text(btnText("Профиль", "profile"), "nav:profile")
      .text(btnText("История", "history"), "nav:history").row()
      .text(btnText("Пригласить друга", "gift"), "nav:referral")
      .text(btnText("Поддержка", "info"), "nav:support").row();
    if (ctx.isAdmin) {
      kb.text(btnText("Админка", "gear"), "nav:admin");
    }
    return kb;
  }

  function buildMenuView(ctx: BotContext): ShopView {
    const shop = getShopSettings(db);
    const header = `${heading("info", `<b>AGENT MUSIC</b>`)}`;
    const features = [
      `${heading("music", "<b>Генерация</b> плейлиста под настроение")}`,
      `${heading("search", "<b>Поиск</b> треков и альбомов")}`,
      `${heading("money", "<b>Жми</b>: кнопку ниже чтобы начать пользоваться")}`,
    ].join("\n");
    const body = `${shop.shopName}\n\n<i>${shop.aboutText}</i>`;
    return { text: `${header}\n\n${features}\n\n${body}`, keyboard: buildStartKeyboard(ctx) };
  }

  function buildSupportView(): ShopView {
    const shop = getShopSettings(db);
    const text = shop.supportContact ? `Поддержка: ${shop.supportContact}` : "Контакт поддержки не указан.";
    const kb = new InlineKeyboard().text(btnText("Назад", "back"), "nav:menu");
    return { text, keyboard: kb };
  }

  bot.command("start", async (ctx) => {
    const isNewUser = upsertUser(db, ctx.chat.id, ctx.from?.username ?? null);
    if (isNewUser) {
      alertNewUser(ctx.chat.id, ctx.from?.username).catch(() => {});
    }
    const refMatch = /^ref_(\d+)$/.exec(ctx.match ?? "");
    if (isNewUser && refMatch) {
      const referrerChatId = Number(refMatch[1]);
      if (applyReferral(db, referrerChatId, ctx.chat.id)) {
        bot.api.sendMessage(referrerChatId, `${heading("gift", "Новый реферал!")} Вам начислены генерации — /referral для подробностей.`, { parse_mode: "HTML" }).catch(() => {});
      }
    }
    try {
      const photos = await bot.api.getUserProfilePhotos(ctx.chat.id, { limit: 1 });
      const first = photos.photos[0];
      if (first && first.length > 0) {
        setPhotoFileId(db, ctx.chat.id, first[first.length - 1]!.file_id);
      }
    } catch { /* non-critical; profile will show placeholder */ }

    // Clear the old persistent reply keyboard ("Мои плейлисты" / "Моя
    // музыка") from earlier builds — Telegram clients keep it displayed
    // until a message explicitly removes it, even after the bot stops
    // sending it. Sent as an invisible, self-deleting message; fire-and-forget
    // so it doesn't delay the real menu below.
    ctx
      .reply("⁣", { reply_markup: { remove_keyboard: true } })
      .then((cleared) => ctx.api.deleteMessage(ctx.chat.id, cleared.message_id))
      .catch(() => { /* best-effort; non-critical if it fails */ });

    const view = buildMenuView(ctx);
    await ctx.reply(view.text, { reply_markup: view.keyboard, parse_mode: "HTML" });
  });

  bot.command("app", async (ctx) => {
    const keyboard = new InlineKeyboard().webApp(btnText("Открыть приложение", "app"), env.publicOrigin);
    await ctx.reply(`${heading("info", "Откройте мини-приложение:")}`, {
      reply_markup: keyboard,
      parse_mode: "HTML",
    });
  });

  bot.command("about", async (ctx) => {
    const shop = getShopSettings(db);
    await ctx.reply(`${heading("info", `${shop.shopName}`)}\n\n${shop.aboutText}`, { parse_mode: "HTML" });
  });

  bot.command("support", async (ctx) => {
    const shop = getShopSettings(db);
    await ctx.reply(shop.supportContact ? `Поддержка: ${shop.supportContact}` : "Контакт поддержки не указан.");
  });

  registerShop(bot, db);
  registerAdminPanel(bot, db);
  registerCredits(bot, db);
  registerModel(bot, db);
  registerReset(bot, db);
  registerHistory(bot, db);
  registerReferral(bot, db);

  async function editOrReply(ctx: BotContext, view: ShopView): Promise<void> {
    try {
      await ctx.editMessageText(view.text, { reply_markup: view.keyboard, parse_mode: "HTML" });
    } catch {
      await ctx.reply(view.text, { reply_markup: view.keyboard, parse_mode: "HTML" });
    }
  }

  bot.callbackQuery(/^nav:(\w+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat!.id;
    switch (ctx.match[1]) {
      case "menu":
        await editOrReply(ctx, buildMenuView(ctx));
        break;
      case "buy": {
        const view = buildBuyView(db, chatId);
        if (!view) {
          await ctx.reply("Пакеты пока не настроены. Загляните позже.");
          break;
        }
        await editOrReply(ctx, view);
        break;
      }
      case "profile":
        await editOrReply(ctx, buildProfileView(db, chatId));
        break;
      case "history":
        await editOrReply(ctx, buildHistoryView(db, chatId));
        break;
      case "referral":
        await editOrReply(ctx, await buildReferralView(bot, db, chatId));
        break;
      case "support":
        await editOrReply(ctx, buildSupportView());
        break;
      case "admin": {
        if (!ctx.isAdmin) return;
        await ctx.reply("Админ-панель:", { reply_markup: menuKeyboard() });
        break;
      }
    }
  });

  bot.command("provider", async (ctx) => {
    if (!ctx.isAdmin) return; // regular users never see this control, per access-control spec
    const arg = ctx.match?.toString().trim();
    if (!arg) {
      const active = getActiveProviderId(db, "opencode");
      await ctx.reply(`Активный провайдер: ${active}\nДоступны: ${AVAILABLE_PROVIDERS.join(", ")}\nИспользование: /provider <id>`);
      return;
    }
    if (!isProviderId(arg)) {
      await ctx.reply(`Неизвестный провайдер «${arg}». Доступны: ${AVAILABLE_PROVIDERS.join(", ")}`);
      return;
    }
    setActiveProviderId(db, arg);
    await ctx.reply(`Активный провайдер установлен: ${arg}.`);
  });

  bot.command("backend", async (ctx) => {
    if (!ctx.isAdmin) return; // regular users never see this control, per access-control spec
    const arg = ctx.match?.toString().trim();
    if (!arg) {
      const active = getActiveBackendId(db, "youtube-music");
      await ctx.reply(`Активный источник: ${active}\nДоступны: ${AVAILABLE_BACKENDS.join(", ")}\nИспользование: /backend <id>`);
      return;
    }
    if (!isMusicBackend(arg)) {
      await ctx.reply(`Неизвестный источник «${arg}». Доступны: ${AVAILABLE_BACKENDS.join(", ")}`);
      return;
    }
    setActiveBackendId(db, arg);
    await ctx.reply(`Активный источник установлен: ${arg}.`);
  });

  bot.api.setChatMenuButton({
    menu_button: { type: "web_app", text: "Открыть", web_app: { url: env.publicOrigin } },
  }).catch(() => {});

  bot.api.setMyCommands([
    { command: "start", description: "Главное меню" },
    { command: "credits", description: "Мои кредиты и подписка" },
    { command: "model", description: "Выбрать AI модель" },
    { command: "history", description: "История генераций" },
    { command: "reset", description: "Сбросить сессию" },
    { command: "app", description: "Открыть мини-приложение" },
    { command: "about", description: "О боте" },
    { command: "buy", description: "Купить доступ" },
    { command: "profile", description: "Мой профиль" },
    { command: "support", description: "Поддержка" },
  ]).catch(() => {});

  // Telegram Stars (XTR): approve every checkout our own bot issued, then grant
  // the purchased playlist slots idempotently by charge id on confirmation.
  bot.on("pre_checkout_query", async (ctx) => {
    await ctx.answerPreCheckoutQuery(true).catch(() => {});
  });

  bot.on("message:successful_payment", async (ctx) => {
    const payment = ctx.message.successful_payment;
    const match = payment.invoice_payload.match(/^slots:(-?\d+):(\d+):/);
    if (!match) return;
    const chatId = Number(match[1]);
    const slots = Number(match[2]);
    const granted = grantPlaylistSlotsForPayment(db, payment.telegram_payment_charge_id, chatId, slots);
    if (granted) {
      await ctx
        .reply(`${heading("check", `Готово! +${slots} к лимиту плейлистов.`)}`, { parse_mode: "HTML" })
        .catch(() => {});
    }
  });

  bot.on("message:text", async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return; // unknown commands: ignore

    if (upsertUser(db, chatId, ctx.from?.username ?? null)) {
      alertNewUser(chatId, ctx.from?.username).catch(() => {});
    }

    // Admin multi-step flows (add offer / broadcast / settings) consume text first.
    if (await handleAdminText(ctx, db, send)) return;

    // Playlist generation happens only in the Mini App now.
    await ctx.reply(`${heading("info", "Открой мини-приложение, чтобы сгенерировать плейлист.")}`, { parse_mode: "HTML" });
  });

  return bot;
}
