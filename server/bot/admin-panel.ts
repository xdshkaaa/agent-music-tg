import { Bot, InlineKeyboard } from "grammy";
import type { AppDb } from "../db";
import type { BotContext } from "./context";
import { getAdminStats, type StatsPeriod } from "../admin/stats";
import { broadcast, type BroadcastSendFn } from "../admin/broadcast";
import { listOffers, createOffer, setOfferActive, deleteOffer, type GrantKind } from "../payments/offers-store";
import { isSupportedAsset, SUPPORTED_ASSETS as SUPPORTED_CRYPTO_ASSETS } from "../payments/crypto-pay";
import {
  getShopSettings, setShopSettings,
  getActiveProviderId, setActiveProviderId,
  getActiveBackendId, setActiveBackendId,
  getProviderOverrides, setProviderOverrides,
  getPaymentsEnabled, setPaymentsEnabled,
  getAllSettings, setSettingValue,
  type ProviderOverrides,
} from "../lib/settings";
import { getAdminFlow, setAdminFlow, clearSession } from "./session";
import { accent, btnText, heading } from "./emoji";
import { AVAILABLE_PROVIDERS, getProviderDefaults, isProviderId } from "../agent/registry";
import { AVAILABLE_BACKENDS } from "../music/registry";
import { listUsers, getUser, addCredits, extendSubscription, revokeSubscription, resetTrial } from "../access/users-store";
import { getAllowlist, addToAllowlist, removeFromAllowlist, setChatAdminRole } from "../lib/access-control";
import {
  listRequiredChannels,
  getRequiredChannel,
  addRequiredChannel,
  removeRequiredChannel,
  getRequiredChannelsCount,
  setSubscriptionGateEnabled,
  isSubscriptionGateEnabled,
} from "../access/channel-gate-store";

export function menuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(btnText("Статистика", "stats"), "admin:stats").row()
    .text(btnText("Пакеты", "package"), "admin:offers").row()
    .text(btnText("Рассылка", "broadcast"), "admin:broadcast").row()
    .text(btnText("Провайдер", "ruler"), "admin:provider")
    .text(btnText("Источник", "music"), "admin:backend").row()
    .text(btnText("Настройки", "gear"), "admin:settings")
    .text(btnText("Пользователи", "gear"), "admin:users")
    .text(btnText("Выдача", "gear"), "admin:issuance").row()
    .text(btnText("Доступ", "gear"), "admin:access")
    .text(btnText("Платежи", "gear"), "admin:payments").row()
    .text(btnText("Каналы", "gear"), "admin:channel-gate").row()
    .text(btnText("Провайдеры", "gear"), "admin:providers")
    .text(btnText("Все настройки", "gear"), "admin:all-settings");
}

const STATS_PERIOD_LABELS: Record<StatsPeriod, string> = {
  today: "Сегодня",
  week: "Неделя",
  month: "Месяц",
  all: "Всё время",
};

function statsKeyboard(active: StatsPeriod): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const p of ["today", "week", "month", "all"] as StatsPeriod[]) {
    const label = p === active ? `✓ ${STATS_PERIOD_LABELS[p]}` : STATS_PERIOD_LABELS[p];
    kb.text(label, `admin:stats:${p}`);
  }
  return kb;
}

function statsText(s: ReturnType<typeof getAdminStats>): string {
  const rev = s.revenue.length > 0 ? s.revenue.map((r) => `${r.total} ${r.asset}`).join(", ") : "0";
  const revAllTime =
    s.revenueAllTime.length > 0 ? s.revenueAllTime.map((r) => `${r.total} ${r.asset}`).join(", ") : "0";
  const conv = s.conversionRate === null ? "—" : `${(s.conversionRate * 100).toFixed(1)}%`;
  const top = s.topOffers.length > 0 ? s.topOffers.map((o) => `${o.title} (${o.count})`).join(", ") : "—";
  const topUsers =
    s.topActiveUsers.length > 0
      ? s.topActiveUsers
          .map((u, i) => `${i + 1}. ${u.username ? "@" + u.username : u.chatId} — ${u.generations}`)
          .join("\n")
      : "—";
  const seg = s.segments;
  const funnelLabels: Record<(typeof s.funnel)[number]["event"], string> = {
    acquired: "Пришли",
    miniapp_opened: "Открыли приложение",
    generation_started: "Начали генерацию",
    generation_completed: "Получили плейлист",
    checkout_started: "Начали оплату",
    purchase_completed: "Оплатили",
  };
  const funnel = s.funnel
    .map((step) => `${funnelLabels[step.event]}: ${step.users}${step.overallConversion === null ? "" : ` (${(step.overallConversion * 100).toFixed(1)}%)`}`)
    .join("\n");
  const attributionLabel = (value: string | null): string => {
    if (!value) return "";
    return {
      direct: "Прямой",
      referral: "Реферальная программа",
      unknown: "Неизвестный",
      telegram: "Telegram",
      legacy: "Исторические данные",
      "deep-link": "Диплинк",
    }[value] ?? value;
  };
  const sources = s.trafficSources
    .slice(0, 5)
    .map((source) => `${attributionLabel(source.source)}${source.medium ? ` / ${attributionLabel(source.medium)}` : ""}: ${source.users} → ${source.payers}`)
    .join("\n") || "Нет данных";
  const campaigns = s.utmCampaigns
    .slice(0, 5)
    .map((campaign) => `${campaign.campaign}: ${campaign.users} → ${campaign.payers}`)
    .join("\n") || "Нет данных";
  return (
    `<b>${heading("stats", "Статистика")}</b> · ${STATS_PERIOD_LABELS[s.period]}\n` +
    `Всего пользователей: ${s.totalUsers}\n` +
    `Новых за период: ${s.newUsers}\n` +
    `Активных подписок: ${s.activeSubscriptions}\n` +
    `Оплаченных покупок: ${s.paidPurchases}\n` +
    `Выручка за период: ${rev}\n` +
    `Выручка всего: ${revAllTime}\n` +
    `Конверсия: ${conv}\n` +
    `Топ пакеты: ${top}\n\n` +
    `<b>Сегменты пользователей</b>\n` +
    `С подпиской: ${seg.activeSubscription}\n` +
    `На трайле: ${seg.trialActive}\n` +
    `Покупали, без подписки: ${seg.payingNoSubscription}\n` +
    `Бесплатные, без покупок: ${seg.freeNoActivity}\n\n` +
    `<b>Топ по активности</b> (генераций)\n${topUsers}\n\n` +
    `<b>Воронка привлечения</b>\n${funnel}\n\n` +
    `<b>Источники трафика</b>\n${sources}\n\n` +
    `<b>UTM-кампании</b>\n${campaigns}`
  );
}

async function showStats(ctx: BotContext, db: AppDb, period: StatsPeriod, edit: boolean): Promise<void> {
  const s = getAdminStats(db, period);
  const text = statsText(s);
  const reply_markup = statsKeyboard(period);
  if (edit) {
    await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", reply_markup });
  }
}

async function showOffers(ctx: BotContext, db: AppDb): Promise<void> {
  const offers = listOffers(db);
  const kb = new InlineKeyboard();
  for (const o of offers) {
    kb
      .text(
        btnText(
          `${o.title} (${o.amount} ${o.asset}${o.starsAmount ? ` / ${o.starsAmount} Stars` : ""}${o.rubAmount ? ` / ${o.rubAmount} ₽` : ""})`,
          "package",
          o.active ? "success" : "danger",
        ),
        `admin:offer:toggle:${o.id}`,
      )
      .text(btnText("Удалить", "trash", "danger"), `admin:offer:del:${o.id}`)
      .row();
  }
  kb.text(btnText("Добавить пакет", "plus"), "admin:addoffer");
  await ctx.reply(
    offers.length ? `<b>${heading("package", "Пакеты")}</b> (нажмите, чтобы вкл/выкл):` : "Пакетов нет.",
    { reply_markup: kb, parse_mode: "HTML" },
  );
}

async function showSettings(ctx: BotContext, db: AppDb): Promise<void> {
  const s = getShopSettings(db);
  const kb = new InlineKeyboard()
    .text(btnText("Название", "gear"), "admin:set:shopName").row()
    .text(btnText("Поддержка", "gear"), "admin:set:supportContact").row()
    .text(btnText("Описание", "gear"), "admin:set:aboutText");
  await ctx.reply(
    `<b>${heading("gear", "Настройки")}</b>\nНазвание: ${s.shopName}\nПоддержка: ${s.supportContact || "—"}\nОписание: ${s.aboutText}`,
    { reply_markup: kb, parse_mode: "HTML" },
  );
}

async function showProviderSelection(ctx: BotContext, db: AppDb): Promise<void> {
  const active = getActiveProviderId(db, "opencode");
  const kb = new InlineKeyboard();
  for (const id of AVAILABLE_PROVIDERS) {
    const style = id === active ? "success" : undefined;
    const label = id === active ? `✓ ${id}` : id;
    kb.text(btnText(label, "ruler", style), `admin:provider:set:${id}`).row();
  }
  kb.text(btnText("Назад", "back"), "admin:menu");
  await ctx.reply(
    `<b>${heading("ruler", "Провайдер")}</b>\nАктивный: ${active}`,
    { reply_markup: kb, parse_mode: "HTML" },
  );
}

async function showBackendSelection(ctx: BotContext, db: AppDb): Promise<void> {
  const active = getActiveBackendId(db, "youtube-music");
  const kb = new InlineKeyboard();
  for (const id of AVAILABLE_BACKENDS) {
    const style = id === active ? "success" : undefined;
    const label = id === active ? `✓ ${id}` : id;
    kb.text(btnText(label, "music", style), `admin:backend:set:${id}`).row();
  }
  kb.text(btnText("Назад", "back"), "admin:menu");
  await ctx.reply(
    `<b>${heading("music", "Источник")}</b>\nАктивный: ${active}`,
    { reply_markup: kb, parse_mode: "HTML" },
  );
}

// --- New bot admin helpers ---

async function showUsers(ctx: BotContext, db: AppDb): Promise<void> {
  const users = listUsers(db);
  if (users.length === 0) {
    await ctx.reply("Нет пользователей.");
    return;
  }
  const lines = users.map((u) =>
    `#${u.chatId} ${u.username ?? "—"}\nCredits: ${u.credits} | Подписка: ${u.subscriptionUntil && u.subscriptionUntil > Math.floor(Date.now() / 1000) ? `до ${new Date(u.subscriptionUntil * 1000).toLocaleDateString()}` : "нет"}`,
  );
  for (const batch of chunk(lines, 20)) {
    await ctx.reply(`<b>${heading("gear", "Пользователи")}</b>\n\n${batch.join("\n\n")}`, { parse_mode: "HTML" });
  }
  const kb = new InlineKeyboard()
    .text(btnText("Начислить credits", "plus"), "admin:users:grant")
    .text(btnText("Продлить подписку", "plus"), "admin:users:sub").row()
    .text(btnText("Сбросить пробный пакет", "plus"), "admin:users:trial-reset").row()
    .text(btnText("Назад", "back"), "admin:menu");
  await ctx.reply("Действия:", { reply_markup: kb });
}

async function showIssuanceMenu(ctx: BotContext, db: AppDb): Promise<void> {
  const kb = new InlineKeyboard()
    .text(btnText("Начислить credits", "plus"), "admin:issuance:credits")
    .text(btnText("Продлить подписку", "plus"), "admin:issuance:sub").row()
    .text(btnText("Отозвать подписку", "trash", "danger"), "admin:issuance:revoke").row()
    .text(btnText("Назад", "back"), "admin:menu");
  await ctx.reply(
    `<b>${heading("gear", "Выдача")}</b>\nУправление credits и подписками пользователей.`,
    { reply_markup: kb, parse_mode: "HTML" },
  );
}

async function showAccessPanel(ctx: BotContext, db: AppDb): Promise<void> {
  const entries = getAllowlist(db);
  const crown = accent("crown");
  const profile = accent("profile");
  const lines = entries.map((e) =>
    `#${e.chatId} — ${e.isAdmin ? `${crown ? crown + " " : ""}админ` : `${profile ? profile + " " : ""}пользователь`}`,
  );
  const kb = new InlineKeyboard()
    .text(btnText("Добавить", "plus"), "admin:access:add")
    .text(btnText("Удалить", "trash", "danger"), "admin:access:remove").row()
    .text(btnText("Назначить админом", "ruler"), "admin:access:set-role").row()
    .text(btnText("Назад", "back"), "admin:menu");
  await ctx.reply(
    `<b>${heading("gear", "Доступ")}</b>\n\n${lines.length ? lines.join("\n") : "Список пуст."}`,
    { reply_markup: kb, parse_mode: "HTML" },
  );
}

async function showProviderConfig(ctx: BotContext, db: AppDb): Promise<void> {
  const keyEmoji = accent("key");
  const crossEmoji = accent("cross");
  const lines = AVAILABLE_PROVIDERS.map((id) => {
    const envDef = getProviderDefaults(id);
    const dbOverrides = getProviderOverrides(db, id);
    const statusEmoji = envDef.apiKeyConfigured ? keyEmoji : crossEmoji;
    const lines = [`<b>${id}</b>${statusEmoji ? " " + statusEmoji : ""}`];
    lines.push(`  Model: ${dbOverrides.model ?? envDef.model}`);
    if (dbOverrides.baseUrl || envDef.baseUrl) {
      lines.push(`  URL: ${dbOverrides.baseUrl ?? envDef.baseUrl}`);
    }
    if (dbOverrides.model) lines.push(`  <i>(override model: ${dbOverrides.model})</i>`);
    return lines.join("\n");
  });
  const kb = new InlineKeyboard();
  for (const id of AVAILABLE_PROVIDERS) {
    kb.text(btnText(id, "ruler"), `admin:provider-config:edit:${id}`).row();
  }
  kb.text(btnText("Назад", "back"), "admin:menu");
  await ctx.reply(
    `<b>${heading("gear", "Конфигурация провайдеров")}</b>\n\n${lines.join("\n\n")}`,
    { reply_markup: kb, parse_mode: "HTML" },
  );
}

async function showPaymentsPanel(ctx: BotContext, db: AppDb): Promise<void> {
  const { paymentsEnabled } = { paymentsEnabled: getPaymentsEnabled(db, true) };
  const on = accent("success_on");
  const off = accent("success_off");
  const statusEmoji = paymentsEnabled ? on : off;
  const kb = new InlineKeyboard()
    .text(btnText(paymentsEnabled ? "Выключить" : "Включить", "plus"), "admin:payments:toggle").row()
    .text(btnText("Назад", "back"), "admin:menu");
  await ctx.reply(
    `<b>${heading("gear", "Платежи")}</b>\nСтатус: ${statusEmoji ? statusEmoji + " " : ""}${paymentsEnabled ? "Включены" : "Выключены"}`,
    { reply_markup: kb, parse_mode: "HTML" },
  );
}

async function showAllSettings(ctx: BotContext, db: AppDb): Promise<void> {
  const settings = getAllSettings(db);
  const lines = settings.map((s) => `<b>${s.key}</b>: ${s.value}`);
  const kb = new InlineKeyboard()
    .text(btnText("Добавить", "plus"), "admin:all-settings:add").row()
    .text(btnText("Изменить", "ruler"), "admin:all-settings:edit").row()
    .text(btnText("Назад", "back"), "admin:menu");
  await ctx.reply(
    `<b>${heading("gear", "Все настройки")}</b>\n\n${lines.length ? lines.join("\n") : "Нет настроек."}`,
    { reply_markup: kb, parse_mode: "HTML" },
  );
}

async function showChannelGate(ctx: BotContext, db: AppDb): Promise<void> {
  const enabled = isSubscriptionGateEnabled(db);
  const channels = listRequiredChannels(db);
  const linkEmoji = accent("link");
  const on = accent("success_on");
  const off = accent("success_off");

  const lines = channels.length > 0
    ? channels.map(
        (ch) =>
          `• <b>${ch.title}</b>${ch.username ? ` (@${ch.username})` : ""}${ch.inviteLink && linkEmoji ? ` ${linkEmoji}` : ""}`,
      )
    : ["Нет обязательных каналов."];

  const statusEmoji = enabled ? on : off;
  const header = `${statusEmoji ? statusEmoji + " " : ""}${enabled ? "Включены" : "Выключены"}`;

  const kb = new InlineKeyboard()
    .text(btnText(enabled ? "Выключить" : "Включить", "plus"), "admin:channel-gate:toggle")
    .text(btnText("Добавить канал", "plus"), "admin:channel-gate:add").row();

  for (const ch of channels) {
    kb.text(btnText(`Удалить ${ch.title}`, "trash", "danger"), `admin:channel-gate:del:${ch.channelId}`).row();
  }

  kb.text(btnText("Назад", "back"), "admin:menu");

  await ctx.reply(
    `<b>${heading("gear", "Шлюз подписок")}</b>\n\n${header}\n\n${lines.join("\n")}`,
    { reply_markup: kb, parse_mode: "HTML" },
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

/**
 * Handles free-text input while an admin FSM flow is active. Returns true if
 * the message was consumed (caller must not treat it as a generation prompt).
 */
export async function handleAdminText(ctx: BotContext, db: AppDb, send: BroadcastSendFn): Promise<boolean> {
  if (!ctx.isAdmin) return false;
  const chatId = ctx.chat!.id;
  const flow = getAdminFlow(db, chatId);
  if (!flow) return false;
  const text = ctx.message?.text?.trim() ?? "";

  if (flow.kind === "admin_broadcast") {
    clearSession(db, chatId);
    await ctx.reply("Отправляю рассылку…");
    const res = await broadcast(db, { text, buttons: [] }, send);
    await ctx.reply(`Готово. Доставлено: ${res.sent}, ошибок: ${res.failed}.`);
    return true;
  }

  if (flow.kind === "admin_setting") {
    clearSession(db, chatId);
    setShopSettings(db, { [flow.field]: text });
    await ctx.reply("Сохранено.");
    return true;
  }

  if (flow.kind === "admin_grant_credits") {
    clearSession(db, chatId);
    const amount = Number(text);
    if (!Number.isFinite(amount) || amount === 0) {
      await ctx.reply("Введите ненулевое число.");
      return true;
    }
    try {
      addCredits(db, flow.chatId, amount, chatId);
      const updated = getUser(db, flow.chatId);
      await ctx.reply(`Начислено ${amount} credits пользователю #${flow.chatId}. Баланс: ${updated?.credits ?? 0}`);
    } catch {
      await ctx.reply("Ошибка при начислении credits.");
    }
    return true;
  }

  if (flow.kind === "admin_extend_subscription") {
    clearSession(db, chatId);
    const days = Number(text);
    if (!Number.isFinite(days) || days <= 0) {
      await ctx.reply("Введите положительное число дней.");
      return true;
    }
    extendSubscription(db, flow.chatId, days, chatId);
    const updated = getUser(db, flow.chatId);
    await ctx.reply(`Подписка продлена на ${days} дн. для пользователя #${flow.chatId}. Действует до: ${updated?.subscriptionUntil ? new Date(updated.subscriptionUntil * 1000).toLocaleDateString() : "—"}`);
    return true;
  }

  if (flow.kind === "admin_issuance_credits_chatid") {
    clearSession(db, chatId);
    const targetId = Number(text);
    if (!Number.isFinite(targetId)) {
      await ctx.reply("Введите числовой chat ID.");
      return true;
    }
    setAdminFlow(db, chatId, { kind: "admin_issuance_credits_amount", targetId });
    await ctx.reply("Сколько credits начислить? (отрицательное значение: списать)");
    return true;
  }

  if (flow.kind === "admin_issuance_credits_amount") {
    clearSession(db, chatId);
    const amount = Number(text);
    if (!Number.isFinite(amount) || amount === 0) {
      await ctx.reply("Введите ненулевое число.");
      return true;
    }
    try {
      addCredits(db, flow.targetId, amount, chatId);
      const updated = getUser(db, flow.targetId);
      await ctx.reply(`Начислено ${amount} credits пользователю #${flow.targetId}. Баланс: ${updated?.credits ?? 0}`);
    } catch {
      await ctx.reply("Ошибка при начислении credits.");
    }
    return true;
  }

  if (flow.kind === "admin_issuance_sub_chatid") {
    clearSession(db, chatId);
    const targetId = Number(text);
    if (!Number.isFinite(targetId)) {
      await ctx.reply("Введите числовой chat ID.");
      return true;
    }
    setAdminFlow(db, chatId, { kind: "admin_issuance_sub_days", targetId });
    await ctx.reply("На сколько дней продлить подписку?");
    return true;
  }

  if (flow.kind === "admin_issuance_sub_days") {
    clearSession(db, chatId);
    const days = Number(text);
    if (!Number.isFinite(days) || days <= 0) {
      await ctx.reply("Введите положительное число дней.");
      return true;
    }
    extendSubscription(db, flow.targetId, days, chatId);
    const updated = getUser(db, flow.targetId);
    await ctx.reply(`Подписка продлена на ${days} дн. для пользователя #${flow.targetId}. Действует до: ${updated?.subscriptionUntil ? new Date(updated.subscriptionUntil * 1000).toLocaleDateString() : "—"}`);
    return true;
  }

  if (flow.kind === "admin_issuance_revoke_chatid") {
    clearSession(db, chatId);
    const targetId = Number(text);
    if (!Number.isFinite(targetId)) {
      await ctx.reply("Введите числовой chat ID.");
      return true;
    }
    revokeSubscription(db, targetId, chatId);
    await ctx.reply(`Подписка пользователя #${targetId} отозвана.`);
    return true;
  }

  if (flow.kind === "admin_access_add") {
    clearSession(db, chatId);
    const id = Number(text);
    if (!Number.isFinite(id)) {
      await ctx.reply("Введите числовой chat ID.");
      return true;
    }
    const isAdmin = text.includes("admin");
    addToAllowlist(db, id, isAdmin);
    await ctx.reply(`Пользователь #${id} добавлен${isAdmin ? " как админ" : ""}.`);
    return true;
  }

  if (flow.kind === "admin_all_settings_key") {
    setAdminFlow(db, chatId, { kind: "admin_all_settings_value", key: text });
    await ctx.reply("Введите значение (или /cancel для отмены):");
    return true;
  }

  if (flow.kind === "admin_all_settings_value") {
    clearSession(db, chatId);
    setSettingValue(db, flow.key, text || null);
    await ctx.reply(`Настройка «${flow.key}» сохранена.`);
    return true;
  }

  if (flow.kind === "admin_provider_config_set") {
    clearSession(db, chatId);
    const overrides: Partial<ProviderOverrides> = {};
    if (flow.field === "model") overrides.model = text || null;
    if (flow.field === "baseUrl") overrides.baseUrl = text || null;
    setProviderOverrides(db, flow.providerId, overrides);
    await ctx.reply(`Параметр «${flow.field}» для провайдера ${flow.providerId} обновлён.`);
    return true;
  }

  if (flow.kind === "admin_add_channel") {
    clearSession(db, chatId);

    let channelId: number | null = null;
    let title = "";
    let username: string | null = null;
    let inviteLink: string | null = null;

    const inviteMatch = text.match(/^(?:https?:\/\/)?t(?:elegram)?\.me\/(?:joinchat\/|\+)([\w_-]+)$/i);
    const usernameMatch = text.match(/^@?(\w{5,32})$/);

    try {
      if (inviteMatch) {
        const chat = await ctx.api.getChat(`@${inviteMatch[1]}`);
        channelId = chat.id;
        title = chat.title ?? "Unknown";
        username = chat.username ?? null;
        inviteLink = text;
      } else if (usernameMatch) {
        const chat = await ctx.api.getChat(`@${usernameMatch[1]}`);
        channelId = chat.id;
        title = chat.title ?? "Unknown";
        username = chat.username ?? null;
      } else {
        await ctx.reply("Не удалось распознать ссылку или @username. Попробуйте ещё раз.");
        return true;
      }
    } catch {
      await ctx.reply(
        "Не удалось найти канал. Убедитесь, что бот добавлен в канал как администратор, и попробуйте ещё раз.",
      );
      return true;
    }

    if (channelId === null) {
      await ctx.reply("Не удалось определить канал. Попробуйте ещё раз.");
      return true;
    }

    try {
      addRequiredChannel(db, channelId, title, username, inviteLink, chatId);
      const check = accent("check");
      await ctx.reply(
        `${check ? check + " " : ""}Канал «<b>${title}</b>»${username ? ` (@${username})` : ""} добавлен в список обязательных.`,
        { parse_mode: "HTML" },
      );
    } catch (err) {
      const msg =
        typeof err === "object" && err !== null && "message" in err
          ? String(err.message)
          : "";
      if (msg.includes("UNIQUE")) {
        await ctx.reply("Этот канал уже добавлен в список обязательных.");
      } else {
        await ctx.reply("Ошибка при сохранении канала.");
      }
    }
    return true;
  }

  if (flow.kind === "admin_trial_reset") {
    clearSession(db, chatId);
    const id = Number(text);
    if (!Number.isFinite(id)) {
      await ctx.reply("Введите числовой chat ID.");
      return true;
    }
    const user = getUser(db, id);
    if (!user || user.trialClaimedAt == null) {
      await ctx.reply(`Пользователь #${id} не найден или не активировал пробный пакет.`);
      return true;
    }
    resetTrial(db, id);
    await ctx.reply(`Пробный пакет сброшен для пользователя #${id}. Теперь он может забрать его снова.`);
    return true;
  }

  // admin_add_offer step machine
  if (flow.kind !== "admin_add_offer") return false;
  const draft = flow.draft;
  switch (flow.step) {
    case "title":
      draft.title = text;
      setAdminFlow(db, chatId, { kind: "admin_add_offer", step: "amount", draft });
      await ctx.reply("Цена (число, напр. 1.5):");
      return true;
    case "amount":
      draft.amount = text;
      setAdminFlow(db, chatId, { kind: "admin_add_offer", step: "asset", draft });
      await ctx.reply("Актив (напр. USDT, TON):");
      return true;
    case "asset": {
      const asset = text.toUpperCase();
      if (!isSupportedAsset(asset)) {
        await ctx.reply(
          `Актив «${asset}» не поддерживается Crypto Pay.\nПоддерживаемые: ${SUPPORTED_CRYPTO_ASSETS.join(", ")}.`,
        );
        return true;
      }
      draft.asset = asset;
      setAdminFlow(db, chatId, { kind: "admin_add_offer", step: "starsAmount", draft });
      await ctx.reply("Цена в Telegram Stars (целое положительное число):");
      return true;
    }
    case "starsAmount": {
      const stars = Number(text);
      if (!Number.isInteger(stars) || stars <= 0) {
        await ctx.reply("Введите целое положительное число.");
        return true;
      }
      draft.starsAmount = String(stars);
      setAdminFlow(db, chatId, { kind: "admin_add_offer", step: "rubAmount", draft });
      await ctx.reply("Цена в рублях для СБП (целое число, 0 — без оплаты в ₽):");
      return true;
    }
    case "rubAmount": {
      const rub = Number(text);
      if (!Number.isInteger(rub) || rub < 0) {
        await ctx.reply("Введите целое число (0 или больше).");
        return true;
      }
      draft.rubAmount = rub > 0 ? String(rub) : "";
      setAdminFlow(db, chatId, { kind: "admin_add_offer", step: "grantKind", draft });
      await ctx.reply("Тип выдачи: напишите `credits` (генерации) или `subscription` (подписка):");
      return true;
    }
    case "grantKind": {
      const kind = text.toLowerCase();
      if (kind !== "credits" && kind !== "subscription") {
        await ctx.reply("Введите `credits` или `subscription`.");
        return true;
      }
      draft.grantKind = kind;
      setAdminFlow(db, chatId, { kind: "admin_add_offer", step: "grantAmount", draft });
      await ctx.reply(kind === "subscription" ? "Сколько дней подписки?" : "Сколько генераций?");
      return true;
    }
    case "grantAmount": {
      const amount = Number(text);
      if (!Number.isFinite(amount) || amount <= 0) {
        await ctx.reply("Введите положительное число.");
        return true;
      }
      clearSession(db, chatId);
      const offer = createOffer(db, {
        title: draft.title ?? "",
        amount: draft.amount ?? "0",
        asset: draft.asset ?? "USDT",
        starsAmount: Number(draft.starsAmount),
        rubAmount: draft.rubAmount ? Number(draft.rubAmount) : null,
        grantKind: (draft.grantKind as GrantKind) ?? "credits",
        grantAmount: amount,
      });
      const priceParts = [`${offer.amount} ${offer.asset}`];
      if (offer.starsAmount) priceParts.push(`${offer.starsAmount} Stars`);
      if (offer.rubAmount) priceParts.push(`${offer.rubAmount} ₽`);
      await ctx.reply(`Пакет создан: ${offer.title} (${priceParts.join(" / ")}).`);
      return true;
    }
  }
}

/** Registers /admin and all admin callbacks. */
export function registerAdminPanel(bot: Bot<BotContext>, db: AppDb): void {
  bot.command("admin", async (ctx) => {
    if (!ctx.isAdmin) return;
    await ctx.reply("Админ-панель:", { reply_markup: menuKeyboard() });
  });

  bot.callbackQuery("admin:stats", async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    await showStats(ctx, db, "all", false);
  });

  bot.callbackQuery(/^admin:stats:(today|week|month|all)$/, async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    const period = ctx.match[1] as StatsPeriod;
    await ctx.answerCallbackQuery();
    await showStats(ctx, db, period, true);
  });

  bot.callbackQuery("admin:offers", async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    await showOffers(ctx, db);
  });

  bot.callbackQuery("admin:settings", async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    await showSettings(ctx, db);
  });

  bot.callbackQuery("admin:provider", async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    await showProviderSelection(ctx, db);
  });

  bot.callbackQuery("admin:backend", async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    await showBackendSelection(ctx, db);
  });

  bot.callbackQuery("admin:menu", async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    await ctx.reply("Админ-панель:", { reply_markup: menuKeyboard() });
  });

  bot.callbackQuery(/^admin:provider:set:(.+)$/, async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    const id = ctx.match![1]!;
    setActiveProviderId(db, id);
    await ctx.answerCallbackQuery({ text: `Провайдер: ${id}` });
    await showProviderSelection(ctx, db);
  });

  bot.callbackQuery(/^admin:backend:set:(.+)$/, async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    const id = ctx.match![1]!;
    setActiveBackendId(db, id);
    await ctx.answerCallbackQuery({ text: `Источник: ${id}` });
    await showBackendSelection(ctx, db);
  });

  bot.callbackQuery("admin:addoffer", async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    setAdminFlow(db, ctx.chat!.id, { kind: "admin_add_offer", step: "title", draft: {} });
    await ctx.reply("Название пакета:");
  });

  bot.callbackQuery("admin:broadcast", async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    setAdminFlow(db, ctx.chat!.id, { kind: "admin_broadcast" });
    await ctx.reply("Пришлите текст рассылки:");
  });

  bot.callbackQuery(/^admin:set:(shopName|supportContact|aboutText)$/, async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    const field = ctx.match[1] as "shopName" | "supportContact" | "aboutText";
    setAdminFlow(db, ctx.chat!.id, { kind: "admin_setting", field });
    await ctx.reply("Введите новое значение:");
  });

  bot.callbackQuery(/^admin:offer:toggle:(\d+)$/, async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    const id = Number(ctx.match[1]);
    const offer = listOffers(db).find((o) => o.id === id);
    if (offer) setOfferActive(db, id, !offer.active);
    await ctx.answerCallbackQuery({ text: offer ? (offer.active ? "Выключен" : "Включён") : "Не найден" });
    await showOffers(ctx, db);
  });

  bot.callbackQuery(/^admin:offer:del:(\d+)$/, async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    deleteOffer(db, Number(ctx.match[1]));
    await ctx.answerCallbackQuery({ text: "Удалён" });
    await showOffers(ctx, db);
  });

  // --- New admin handlers ---

  bot.callbackQuery("admin:users", async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    await showUsers(ctx, db);
  });

  bot.callbackQuery("admin:users:grant", async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    await ctx.reply("Начисление credits доступно в Mini App. /app");
  });

  bot.callbackQuery("admin:users:trial-reset", async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    setAdminFlow(db, ctx.chat!.id, { kind: "admin_trial_reset" });
    await ctx.reply("Введите chat ID пользователя, которому нужно сбросить пробный пакет:");
  });

  bot.callbackQuery("admin:access", async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    await showAccessPanel(ctx, db);
  });

  bot.callbackQuery("admin:access:add", async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    setAdminFlow(db, ctx.chat!.id, { kind: "admin_access_add" });
    await ctx.reply("Введите chat ID (или `12345 admin` для назначения админом):");
  });

  bot.callbackQuery("admin:access:remove", async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    await ctx.reply("Используйте Mini App для удаления пользователей. /app");
  });

  bot.callbackQuery("admin:access:set-role", async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    await ctx.reply("Используйте Mini App для управления ролями. /app");
  });

  bot.callbackQuery("admin:payments", async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    await showPaymentsPanel(ctx, db);
  });

  bot.callbackQuery("admin:payments:toggle", async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    const current = getPaymentsEnabled(db, true);
    setPaymentsEnabled(db, !current);
    await ctx.answerCallbackQuery({ text: current ? "Выключены" : "Включены" });
    await showPaymentsPanel(ctx, db);
  });

  bot.callbackQuery("admin:providers", async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    await showProviderConfig(ctx, db);
  });

  bot.callbackQuery(/^admin:provider-config:edit:(.+)$/, async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    const id = ctx.match![1]!;
    if (!isProviderId(id)) {
      await ctx.answerCallbackQuery({ text: "Неизвестный провайдер" });
      return;
    }
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard()
      .text(btnText("Model", "ruler"), `admin:provider-config:edit:${id}:model`)
      .text(btnText("Base URL", "ruler"), `admin:provider-config:edit:${id}:baseUrl`).row()
      .text(btnText("Назад", "back"), "admin:providers");
    await ctx.reply(`Редактирование провайдера <b>${id}</b>:`, { reply_markup: kb, parse_mode: "HTML" });
  });

  bot.callbackQuery(/^admin:provider-config:edit:(.+):(model|baseUrl)$/, async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    const providerId = ctx.match![1]!;
    const field = ctx.match![2]! as "model" | "baseUrl";
    if (!isProviderId(providerId)) {
      await ctx.answerCallbackQuery({ text: "Неизвестный провайдер" });
      return;
    }
    await ctx.answerCallbackQuery();
    setAdminFlow(db, ctx.chat!.id, { kind: "admin_provider_config_set", providerId, field });
    const current = getProviderOverrides(db, providerId);
    const hint = field === "model" ? `Текущий: ${current.model ?? getProviderDefaults(providerId).model}` : `Текущий: ${current.baseUrl ?? getProviderDefaults(providerId).baseUrl ?? "не задан"}`;
    await ctx.reply(`Введите новое значение для <b>${field}</b> (оставьте пустым для сброса):\n${hint}`, { parse_mode: "HTML" });
  });

  bot.callbackQuery("admin:all-settings", async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    await showAllSettings(ctx, db);
  });

  bot.callbackQuery("admin:all-settings:add", async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    setAdminFlow(db, ctx.chat!.id, { kind: "admin_all_settings_key" });
    await ctx.reply("Введите название ключа:");
  });

  bot.callbackQuery("admin:all-settings:edit", async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    await ctx.reply("Используйте Mini App для редактирования настроек. /admin");
  });

  // --- Issuance (grant credits, subscription, revoke) -------------------

  bot.callbackQuery("admin:issuance", async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    await showIssuanceMenu(ctx, db);
  });

  bot.callbackQuery("admin:issuance:credits", async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    setAdminFlow(db, ctx.chat!.id, { kind: "admin_issuance_credits_chatid" });
    await ctx.reply("Введите chat ID пользователя:");
  });

  bot.callbackQuery("admin:issuance:sub", async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    setAdminFlow(db, ctx.chat!.id, { kind: "admin_issuance_sub_chatid" });
    await ctx.reply("Введите chat ID пользователя:");
  });

  bot.callbackQuery("admin:issuance:revoke", async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    setAdminFlow(db, ctx.chat!.id, { kind: "admin_issuance_revoke_chatid" });
    await ctx.reply("Введите chat ID пользователя:");
  });

  // --- Channel subscription gate ---------------------------------------

  bot.callbackQuery("admin:channel-gate", async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    await showChannelGate(ctx, db);
  });

  bot.callbackQuery("admin:channel-gate:add", async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    setAdminFlow(db, ctx.chat!.id, { kind: "admin_add_channel", step: "input" });
    await ctx.reply(
      "Отправьте ссылку-приглашение (@username публичного канала или invite link):",
    );
  });

  bot.callbackQuery(/^admin:channel-gate:del:(-?\d+)$/, async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    const channelId = Number(ctx.match![1]);
    const ch = getRequiredChannel(db, channelId);
    if (ch) {
      removeRequiredChannel(db, channelId);
      await ctx.answerCallbackQuery({ text: `Канал «${ch.title}» удалён` });
    } else {
      await ctx.answerCallbackQuery({ text: "Канал не найден" });
    }
    await showChannelGate(ctx, db);
  });

  bot.callbackQuery("admin:channel-gate:toggle", async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCallbackQuery();
    const current = isSubscriptionGateEnabled(db);
    setSubscriptionGateEnabled(db, !current);
    await ctx.answerCallbackQuery({ text: current ? "Выключен" : "Включён" });
    await showChannelGate(ctx, db);
  });
}
