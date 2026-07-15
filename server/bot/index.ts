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
import { registerShop, sendOffers, purchasePromptText, showProfile } from "./shop";
import { registerAdminPanel, handleAdminText, menuKeyboard } from "./admin-panel";
import { registerCredits } from "./credits";
import { registerModel } from "./model";
import { registerReset } from "./reset";
import { registerHistory, showHistory } from "./history";
import { btnText, heading } from "./emoji";

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
      .text(btnText("Купить", "money"), "nav:buy")
      .text(btnText("Профиль", "profile"), "nav:profile")
      .text(btnText("История", "history"), "nav:history").row()
      .text(btnText("Поддержка", "info"), "nav:support").row();
    if (ctx.isAdmin) {
      kb.text(btnText("Админка", "gear"), "nav:admin");
    }
    return kb;
  }

  bot.command("start", async (ctx) => {
    upsertUser(db, ctx.chat.id, ctx.from?.username ?? null);
    try {
      const photos = await bot.api.getUserProfilePhotos(ctx.chat.id, { limit: 1 });
      const first = photos.photos[0];
      if (first && first.length > 0) {
        setPhotoFileId(db, ctx.chat.id, first[first.length - 1]!.file_id);
      }
    } catch { /* non-critical; profile will show placeholder */ }
    const shop = getShopSettings(db);
    const header = `<b>${heading("info", "AGENT MUSIC")}</b>`;
    const bullets = ["• Сгенерируй плейлист", "• Купи доступ"].join("\n");
    const body = `${shop.shopName}\n\n${shop.aboutText}`;
    await ctx.reply(`${header}\n${bullets}\n\n${body}`, {
      reply_markup: buildStartKeyboard(ctx),
      parse_mode: "HTML",
    });
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

  bot.callbackQuery(/^nav:(\w+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    switch (ctx.match[1]) {
      case "buy":
        await sendOffers(ctx, db, purchasePromptText());
        break;
      case "profile":
        await showProfile(ctx, db);
        break;
      case "history":
        await showHistory(ctx, db);
        break;
      case "support": {
        const shop = getShopSettings(db);
        await ctx.reply(shop.supportContact ? `Поддержка: ${shop.supportContact}` : "Контакт поддержки не указан.");
        break;
      }
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

  bot.on("message:text", async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return; // unknown commands: ignore

    upsertUser(db, chatId, ctx.from?.username ?? null);

    // Admin multi-step flows (add offer / broadcast / settings) consume text first.
    if (await handleAdminText(ctx, db, send)) return;

    // Playlist generation happens only in the Mini App now.
    await ctx.reply(`${heading("info", "Открой мини-приложение, чтобы сгенерировать плейлист.")}`, { parse_mode: "HTML" });
  });

  return bot;
}
