import { InlineKeyboard } from "grammy";
import type { NextFunction } from "grammy";
import type { AppDb } from "../db";
import type { BotContext } from "./context";
import { btnText, accent } from "./emoji";
import {
  listRequiredChannels,
  getCachedMembership,
  setCachedMembership,
  isMembershipCacheFresh,
  isSubscriptionGateEnabled,
} from "../access/channel-gate-store";
import type { RequiredChannel } from "../access/channel-gate-store";

const GATE_MESSAGE_TTL = 300;

interface GateState {
  messageId: number;
  blockedAt: number;
}

const gateMessages = new Map<number, GateState>();

async function buildGateKeyboard(
  channels: RequiredChannel[],
): Promise<InlineKeyboard> {
  const kb = new InlineKeyboard();
  for (const ch of channels) {
    const cleanLabel = ch.title || (ch.username ? `@${ch.username}` : ch.title);
    const url = ch.inviteLink
      ? ch.inviteLink
      : ch.username
        ? `https://t.me/${ch.username}`
        : undefined;
    if (url) {
      kb.url(btnText(cleanLabel, "link"), url);
    } else {
      kb.text(btnText(cleanLabel, "link"), "subgate:nolink");
    }
    kb.row();
  }
  kb.text(btnText("Я вступился", "check"), "subgate:check");
  return kb;
}

async function checkChannelMembership(
  ctx: BotContext,
  db: AppDb,
  channel: RequiredChannel,
  chatId: number,
): Promise<boolean> {
  const cached = getCachedMembership(db, chatId, channel.channelId);

  if (cached && isMembershipCacheFresh(cached.checkedAt, GATE_MESSAGE_TTL)) {
    return cached.isMember;
  }

  try {
    const member = await ctx.api.getChatMember(channel.channelId, chatId);
    const isMember =
      member.status === "member" ||
      member.status === "administrator" ||
      member.status === "creator";
    setCachedMembership(db, chatId, channel.channelId, isMember);
    return isMember;
  } catch (err: unknown) {
    if (typeof err === "object" && err !== null && "error_code" in err) {
      const e = err as { error_code: number };
      if (e.error_code === 429 && cached !== null) {
        return cached.isMember;
      }
    }
    if (cached !== null) {
      return cached.isMember;
    }
    return false;
  }
}

async function checkAllMemberships(
  ctx: BotContext,
  db: AppDb,
  channels: RequiredChannel[],
  chatId: number,
): Promise<boolean> {
  const results = await Promise.all(
    channels.map((ch) => checkChannelMembership(ctx, db, ch, chatId)),
  );
  return results.every(Boolean);
}

async function sendGateMessage(
  ctx: BotContext,
  channels: RequiredChannel[],
  chatId: number,
): Promise<void> {
  const kb = await buildGateKeyboard(channels);
  const channelList = channels
    .map((ch) => `• ${ch.title}${ch.username ? ` (@${ch.username})` : ""}${ch.inviteLink ? "" : " (приглашение не указано)"}`)
    .join("\n");

  const prohibited = accent("prohibited");
  const check = accent("check");
  const text =
    `${prohibited ? prohibited + " " : ""}<b>Доступ ограничен</b>\n\n` +
    `Чтобы пользоваться ботом, подпишитесь на эти каналы:\n\n${channelList}\n\n` +
    `После подписки нажмите «${check ? check + " " : ""}Я вступился».`;

  const sent = await ctx.api.sendMessage(chatId, text, {
    reply_markup: kb,
    parse_mode: "HTML",
  });
  gateMessages.set(chatId, { messageId: sent.message_id, blockedAt: Date.now() });
}

async function editGateMessage(
  ctx: BotContext,
  channels: RequiredChannel[],
  chatId: number,
  state: GateState,
): Promise<void> {
  const kb = await buildGateKeyboard(channels);
  const channelList = channels
    .map((ch) => `• ${ch.title}${ch.username ? ` (@${ch.username})` : ""}${ch.inviteLink ? "" : ""}`)
    .join("\n");

  const prohibited = accent("prohibited");
  const check = accent("check");
  const text =
    `${prohibited ? prohibited + " " : ""}<b>Доступ ограничен</b>\n\n` +
    `Чтобы пользоваться ботом, подпишитесь на эти каналы:\n\n${channelList}\n\n` +
    `После подписки нажмите «${check ? check + " " : ""}Я вступился».`;

  try {
    await ctx.api.editMessageText(chatId, state.messageId, text, {
      reply_markup: kb,
      parse_mode: "HTML",
    });
  } catch {
    const sent = await ctx.api.sendMessage(chatId, text, {
      reply_markup: kb,
      parse_mode: "HTML",
    });
    gateMessages.set(chatId, { messageId: sent.message_id, blockedAt: Date.now() });
  }
}

async function showGateSuccess(
  ctx: BotContext,
  chatId: number,
  state: GateState | undefined,
): Promise<void> {
  const check = accent("check");
  const text = `${check ? check + " " : ""}<b>Спасибо!</b>\n\nВсе подписки подтверждены. Теперь вы можете пользоваться ботом.`;
  if (state) {
    try {
      await ctx.api.editMessageText(chatId, state.messageId, text, {
        parse_mode: "HTML",
      });
    } catch {
      await ctx.api.sendMessage(chatId, text, { parse_mode: "HTML" });
    }
    gateMessages.delete(chatId);
  } else {
    await ctx.api.sendMessage(chatId, text, { parse_mode: "HTML" });
  }
}

export function channelSubscriptionGate(db: AppDb) {
  return async (ctx: BotContext, next: NextFunction) => {
    if (ctx.isAdmin) return next();

    const chatId = ctx.chat?.id ?? ctx.from?.id;
    if (chatId === undefined) return;

    if (!isSubscriptionGateEnabled(db)) return next();

    const channels = listRequiredChannels(db);
    if (channels.length === 0) return next();

    if (ctx.callbackQuery?.data === "subgate:check") {
      const allOk = await checkAllMemberships(ctx, db, channels, chatId);
      if (allOk) {
        const state = gateMessages.get(chatId);
        await showGateSuccess(ctx, chatId, state);
        try { await ctx.answerCallbackQuery(); } catch { /* ignore */ }
        return;
      }
      const state = gateMessages.get(chatId);
      if (state) {
        await editGateMessage(ctx, channels, chatId, state);
      } else {
        await sendGateMessage(ctx, channels, chatId);
      }
      try { await ctx.answerCallbackQuery("Некоторые подписки ещё не оформлены"); } catch { /* ignore */ }
      return;
    }

    if (ctx.callbackQuery) return next();

    const allSubscribed = await checkAllMemberships(ctx, db, channels, chatId);
    if (allSubscribed) {
      const state = gateMessages.get(chatId);
      if (state) {
        gateMessages.delete(chatId);
      }
      return next();
    }

    const state = gateMessages.get(chatId);
    if (state) {
      await editGateMessage(ctx, channels, chatId, state);
    } else {
      await sendGateMessage(ctx, channels, chatId);
    }
  };
}
