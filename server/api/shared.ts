import type { SSEStreamingApi } from "hono/streaming";
import { trialActive } from "../access/entitlements";
import type { User } from "../access/users-store";

export const DEFAULT_PROVIDER = "opencode";
export const DEFAULT_BACKEND = "youtube-music";

/** Additive `/me` trial shape; older clients ignore it. */
export function trialStatus(user: User | null): {
  claimed: boolean;
  active: boolean;
  creditsLeft: number;
  until: number | null;
} {
  return {
    claimed: user?.trialClaimedAt != null,
    active: trialActive(user),
    creditsLeft: user?.trialCredits ?? 0,
    until: user?.trialUntil ?? null,
  };
}

export async function readJsonBody<T extends Record<string, unknown>>(req: Request): Promise<Partial<T>> {
  try {
    return (await req.json()) as Partial<T>;
  } catch {
    return {};
  }
}

/**
 * Last-resort SSE error handler: an unhandled exception inside a stream
 * callback must still deliver a terminal outcome frame, otherwise the Mini App
 * shows "stream ended without an outcome".
 */
export async function sseErrorOutcome(e: Error, stream: SSEStreamingApi): Promise<void> {
  console.error("[generate stream]", e);
  try {
    await stream.writeSSE({
      data: JSON.stringify({
        type: "outcome",
        outcome: { status: "error", message: "Внутренняя ошибка сервера. Попробуйте ещё раз." },
      }),
    });
  } catch {
    // client already disconnected
  }
}
