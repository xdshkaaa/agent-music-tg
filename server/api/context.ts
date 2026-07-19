import type { Context } from "hono";
import type { AudioDeps } from "./audio-routes";
import type { SendFn } from "../admin/broadcast";

export interface AuthVariables {
  chatId: number;
  isAdmin: boolean;
}

export type AppEnv = { Variables: AuthVariables };
export type AppContext = Context<AppEnv>;

export interface ApiDeps {
  /** Sends a Telegram message; enables admin broadcast from the Mini App. */
  send?: SendFn;
  /** Creates a Telegram Stars (XTR) invoice link; enables Stars purchases from the Mini App. */
  createStarsInvoiceLink?: (args: { title: string; description: string; payload: string; starsAmount: number }) => Promise<string>;
  /** Audio download-to-chat + streaming; absent in tests that don't exercise it. */
  audio?: AudioDeps;
}
