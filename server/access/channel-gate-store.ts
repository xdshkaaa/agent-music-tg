import type { AppDb } from "../db";

export interface RequiredChannel {
  channelId: number;
  username: string | null;
  inviteLink: string | null;
  title: string;
  addedBy: number | null;
  createdAt: number;
}

export interface ChannelMembership {
  chatId: number;
  channelId: number;
  isMember: boolean;
  checkedAt: number;
}

const SETTINGS_KEY = "subscription_gate_enabled";

// --- Required channels CRUD ----------------------------------------------

export function listRequiredChannels(db: AppDb): RequiredChannel[] {
  return db
    .query<
      { channel_id: number; username: string | null; invite_link: string | null; title: string; added_by: number | null; created_at: number },
      []
    >(
      `SELECT channel_id, username, invite_link, title, added_by, created_at
       FROM required_channels
       ORDER BY created_at ASC`,
    )
    .all()
    .map((r) => ({
      channelId: r.channel_id,
      username: r.username,
      inviteLink: r.invite_link,
      title: r.title,
      addedBy: r.added_by,
      createdAt: r.created_at,
    }));
}

export function getRequiredChannel(
  db: AppDb,
  channelId: number,
): RequiredChannel | null {
  const r = db
    .query<
      { channel_id: number; username: string | null; invite_link: string | null; title: string; added_by: number | null; created_at: number },
      [number]
    >(
      `SELECT channel_id, username, invite_link, title, added_by, created_at
       FROM required_channels WHERE channel_id = ?`,
    )
    .get(channelId);
  if (!r) return null;
  return {
    channelId: r.channel_id,
    username: r.username,
    inviteLink: r.invite_link,
    title: r.title,
    addedBy: r.added_by,
    createdAt: r.created_at,
  };
}

export function addRequiredChannel(
  db: AppDb,
  channelId: number,
  title: string,
  username?: string | null,
  inviteLink?: string | null,
  addedBy?: number | null,
): void {
  db.query(
    `INSERT INTO required_channels (channel_id, username, invite_link, title, added_by)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(channelId, username ?? null, inviteLink ?? null, title, addedBy ?? null);
}

export function removeRequiredChannel(db: AppDb, channelId: number): void {
  db.transaction(() => {
    db.query(`DELETE FROM channel_memberships WHERE channel_id = ?`).run(channelId);
    db.query(`DELETE FROM required_channels WHERE channel_id = ?`).run(channelId);
  })();
}

export function getRequiredChannelsCount(db: AppDb): number {
  const r = db
    .query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM required_channels`)
    .get();
  return r?.n ?? 0;
}

// --- Gate toggle ---------------------------------------------------------

export function setSubscriptionGateEnabled(db: AppDb, enabled: boolean): void {
  db.query(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(SETTINGS_KEY, enabled ? "1" : "0");
}

export function isSubscriptionGateEnabled(db: AppDb): boolean {
  const r = db
    .query<{ value: string }, [string]>(
      `SELECT value FROM settings WHERE key = ?`,
    )
    .get(SETTINGS_KEY);
  return r?.value === "1";
}

// --- Membership cache ----------------------------------------------------

export function getCachedMemberships(
  db: AppDb,
  chatId: number,
): Map<number, boolean> {
  const rows = db
    .query<{ channel_id: number; is_member: number }, [number]>(
      `SELECT channel_id, is_member FROM channel_memberships WHERE chat_id = ?`,
    )
    .all(chatId);
  const map = new Map<number, boolean>();
  for (const r of rows) {
    map.set(r.channel_id, r.is_member === 1);
  }
  return map;
}

export function getCachedMembership(
  db: AppDb,
  chatId: number,
  channelId: number,
): ChannelMembership | null {
  const r = db
    .query<
      { chat_id: number; channel_id: number; is_member: number; checked_at: number },
      [number, number]
    >(
      `SELECT chat_id, channel_id, is_member, checked_at
       FROM channel_memberships WHERE chat_id = ? AND channel_id = ?`,
    )
    .get(chatId, channelId);
  if (!r) return null;
  return {
    chatId: r.chat_id,
    channelId: r.channel_id,
    isMember: r.is_member === 1,
    checkedAt: r.checked_at,
  };
}

export function setCachedMembership(
  db: AppDb,
  chatId: number,
  channelId: number,
  isMember: boolean,
): void {
  db.query(
    `INSERT INTO channel_memberships (chat_id, channel_id, is_member, checked_at)
     VALUES (?, ?, ?, unixepoch())
     ON CONFLICT(chat_id, channel_id) DO UPDATE SET
       is_member = excluded.is_member,
       checked_at = excluded.checked_at`,
  ).run(chatId, channelId, isMember ? 1 : 0);
}

export function clearChannelMemberships(db: AppDb, channelId: number): void {
  db.query(`DELETE FROM channel_memberships WHERE channel_id = ?`).run(channelId);
}

export function isMembershipCacheFresh(
  checkedAt: number,
  ttlSeconds = 300,
): boolean {
  return Math.floor(Date.now() / 1000) - checkedAt < ttlSeconds;
}
