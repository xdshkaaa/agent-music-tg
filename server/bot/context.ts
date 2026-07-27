import type { Context } from "grammy";

/** grammY context flavor carrying the role resolved by allowlistGate. */
export interface BotContext extends Context {
  isAdmin: boolean;
}

/**
 * Clears the button spinner without waiting for Telegram.
 *
 * Every navigation tap used to await the ack and only then edit the message, so
 * the new screen appeared two round-trips later instead of one. The ack carries
 * no text here, so nothing the user reads depends on its result — and it must
 * stay caught: Telegram rejects acks for callback queries older than ~15s.
 */
export function ackCallback(ctx: BotContext): void {
  void ctx.answerCallbackQuery().catch(() => { /* stale query — the edit still lands */ });
}
