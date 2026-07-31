import { Hono } from "hono";
import type { AppDb } from "../db";
import type { AppEnv, ApiDeps } from "./context";
import {
  listRequiredChannels,
  isSubscriptionGateEnabled,
} from "../access/channel-gate-store";
import { checkAllMembershipsDetailed } from "../access/subscription-check";
import type { MembershipCheckDeps } from "../access/subscription-check";

/**
 * POST /api/subscription/recheck — force-checks all required channels and
 * returns per-channel membership status. Registered before the subscription
 * gate middleware so it isn't blocked by the very gate it exists to clear.
 */
export function createSubscriptionRoutes(db: AppDb, deps: ApiDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.post("/subscription/recheck", async (c) => {
    if (!deps.getChatMember) {
      return c.json({ ok: true, channels: [] });
    }

    const chatId = c.get("chatId");

    if (!isSubscriptionGateEnabled(db)) {
      return c.json({ ok: true, channels: [] });
    }

    const channels = listRequiredChannels(db);
    if (channels.length === 0) {
      return c.json({ ok: true, channels: [] });
    }

    const membershipDeps: MembershipCheckDeps = {
      getChatMember: deps.getChatMember,
    };

    const results = await checkAllMembershipsDetailed(
      db,
      membershipDeps,
      channels,
      chatId,
      true, // force: bypass cache
    );

    const ok = results.every((r) => r.isMember);

    return c.json({
      ok,
      channels: results.map((r) => ({
        channelId: r.channelId,
        title: r.title,
        username: r.username,
        inviteLink: r.inviteLink,
        isMember: r.isMember,
      })),
    });
  });

  return app;
}
