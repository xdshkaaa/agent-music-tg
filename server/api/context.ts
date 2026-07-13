import type { Context } from "hono";

export interface AuthVariables {
  chatId: number;
  isAdmin: boolean;
}

export type AppEnv = { Variables: AuthVariables };
export type AppContext = Context<AppEnv>;
