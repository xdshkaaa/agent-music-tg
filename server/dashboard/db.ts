import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import type { AppDb } from "../db";

/**
 * Opens an environment's sqlite file read-only, without running migrations —
 * this process only ever reads (via server/admin/stats.ts, server/analytics/report.ts
 * and the queries in this directory), it must never be the one to define schema.
 * WAL mode lets an external reader see committed data from the writer process
 * (the actual bot/API server) without locking it out.
 */
export function openReadonlyDb(path: string): AppDb | null {
  if (!existsSync(path)) return null;
  return new Database(path, { readonly: true, create: false });
}

export interface DashDbs {
  prod: AppDb | null;
  dev: AppDb | null;
}
