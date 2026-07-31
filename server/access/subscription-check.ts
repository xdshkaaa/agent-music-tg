import type { AppDb } from "../db";
import {
  getCachedMembership,
  setCachedMembership,
  isMembershipCacheFresh,
} from "./channel-gate-store";
import type { RequiredChannel } from "./channel-gate-store";

const CACHE_TTL_SECONDS = 300;

/**
 * Narrow dependency: the caller provides just the getChatMember call so this
 * module works both in the bot (ctx.api) and the API layer (bot.api) without
 * pulling grammY types into the API layer.
 */
export interface MembershipCheckDeps {
  getChatMember: (channelId: number, chatId: number) => Promise<{ status: string }>;
}

/**
 * Checks whether `chatId` is a member of `channel`.
 *
 * When `force` is false (passive, per-update check), the TTL-cached value is
 * returned if it exists and is fresh — this is the hot path that must not
 * hammer Telegram on every request.
 *
 * When `force` is true (manual recheck button), the cache is bypassed, a live
 * getChatMember call is made, and the fresh result overwrites the cache. This
 * fixes the bug where the bot's "Я вступил" button returned a stale cached
 * "not a member" within the TTL window.
 */
export async function checkChannelMembership(
  db: AppDb,
  deps: MembershipCheckDeps,
  channel: RequiredChannel,
  chatId: number,
  force: boolean,
): Promise<boolean> {
  if (!force) {
    const cached = getCachedMembership(db, chatId, channel.channelId);
    if (cached && isMembershipCacheFresh(cached.checkedAt, CACHE_TTL_SECONDS)) {
      return cached.isMember;
    }
  }

  try {
    const member = await deps.getChatMember(channel.channelId, chatId);
    const isMember =
      member.status === "member" ||
      member.status === "administrator" ||
      member.status === "creator";
    setCachedMembership(db, chatId, channel.channelId, isMember);
    return isMember;
  } catch (err: unknown) {
    // On Telegram rate-limit (429) or any other error, fall back to the
    // cached value if one exists — better stale than broken. Without a
    // cached row, report "not a member" (safe default).
    const cached = getCachedMembership(db, chatId, channel.channelId);
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

/**
 * Checks all required channels. Returns true only if the user is a member of
 * every channel.
 */
export async function checkAllMemberships(
  db: AppDb,
  deps: MembershipCheckDeps,
  channels: RequiredChannel[],
  chatId: number,
  force: boolean,
): Promise<boolean> {
  const results = await Promise.all(
    channels.map((ch) => checkChannelMembership(db, deps, ch, chatId, force)),
  );
  return results.every(Boolean);
}

/**
 * Per-channel membership check results — used by the recheck endpoint so the
 * Mini App can show which channels are still missing.
 */
export interface ChannelMembershipResult {
  channelId: number;
  title: string;
  username: string | null;
  inviteLink: string | null;
  isMember: boolean;
}

export async function checkAllMembershipsDetailed(
  db: AppDb,
  deps: MembershipCheckDeps,
  channels: RequiredChannel[],
  chatId: number,
  force: boolean,
): Promise<ChannelMembershipResult[]> {
  return Promise.all(
    channels.map(async (ch) => ({
      channelId: ch.channelId,
      title: ch.title,
      username: ch.username,
      inviteLink: ch.inviteLink,
      isMember: await checkChannelMembership(db, deps, ch, chatId, force),
    })),
  );
}
