import type { AppDb } from "../db";

const ACTIVE_PROVIDER_KEY = "active_provider";
const ACTIVE_BACKEND_KEY = "active_backend";

function getSetting(db: AppDb, key: string): string | null {
  const row = db.query<{ value: string }, [string]>(`SELECT value FROM settings WHERE key = ?`).get(key);
  return row?.value ?? null;
}

function setSetting(db: AppDb, key: string, value: string): void {
  db.query(
    `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

export function getActiveProviderId(db: AppDb, fallback: string): string {
  return getSetting(db, ACTIVE_PROVIDER_KEY) ?? fallback;
}

export function setActiveProviderId(db: AppDb, providerId: string): void {
  setSetting(db, ACTIVE_PROVIDER_KEY, providerId);
}

export function getActiveBackendId(db: AppDb, fallback: string): string {
  return getSetting(db, ACTIVE_BACKEND_KEY) ?? fallback;
}

export function setActiveBackendId(db: AppDb, backendId: string): void {
  setSetting(db, ACTIVE_BACKEND_KEY, backendId);
}
