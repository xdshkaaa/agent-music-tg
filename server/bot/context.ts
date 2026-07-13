import type { Context } from "grammy";

/** grammY context flavor carrying the role resolved by allowlistGate. */
export interface BotContext extends Context {
  isAdmin: boolean;
}
