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

function deleteSetting(db: AppDb, key: string): void {
  db.query(`DELETE FROM settings WHERE key = ?`).run(key);
}

export interface SettingEntry {
  key: string;
  value: string;
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

// --- Referral settings (editable by admins) ---

const REFERRAL_REWARD_CREDITS_KEY = "referral_reward_credits";
const REFERRAL_MAX_PER_USER_KEY = "referral_max_per_user";

export interface ReferralSettings {
  rewardCredits: number;
  maxPerUser: number; // 0 = unlimited
}

export function getReferralSettings(db: AppDb): ReferralSettings {
  const reward = Number(getSetting(db, REFERRAL_REWARD_CREDITS_KEY));
  const max = Number(getSetting(db, REFERRAL_MAX_PER_USER_KEY));
  return {
    rewardCredits: Number.isInteger(reward) && reward >= 0 ? reward : 1,
    maxPerUser: Number.isInteger(max) && max >= 0 ? max : 0,
  };
}

export function setReferralSettings(db: AppDb, patch: Partial<ReferralSettings>): void {
  if (patch.rewardCredits !== undefined) setSetting(db, REFERRAL_REWARD_CREDITS_KEY, String(patch.rewardCredits));
  if (patch.maxPerUser !== undefined) setSetting(db, REFERRAL_MAX_PER_USER_KEY, String(patch.maxPerUser));
}

// --- Shop settings (editable by admins, used in user-facing bot text) ---

export interface ShopSettings {
  shopName: string;
  supportContact: string;
  aboutText: string;
  headerIcon: string;
  headerTitle: string;
}

const SHOP_NAME_KEY = "shop_name";
const SUPPORT_CONTACT_KEY = "support_contact";
const ABOUT_TEXT_KEY = "about_text";
const HEADER_ICON_KEY = "header_icon";
const HEADER_TITLE_KEY = "header_title";

const SHOP_DEFAULTS: ShopSettings = {
  shopName: "Playlist Bot",
  supportContact: "",
  aboutText: "Опишите настроение или запрос, соберу плейлист. Доступ к генерации покупается через CryptoBot.",
  headerIcon: "",
  headerTitle: "agent music",
};

export function getShopSettings(db: AppDb): ShopSettings {
  return {
    shopName: getSetting(db, SHOP_NAME_KEY) ?? SHOP_DEFAULTS.shopName,
    supportContact: getSetting(db, SUPPORT_CONTACT_KEY) ?? SHOP_DEFAULTS.supportContact,
    aboutText: getSetting(db, ABOUT_TEXT_KEY) ?? SHOP_DEFAULTS.aboutText,
    headerIcon: getSetting(db, HEADER_ICON_KEY) ?? SHOP_DEFAULTS.headerIcon,
    headerTitle: getSetting(db, HEADER_TITLE_KEY) ?? SHOP_DEFAULTS.headerTitle,
  };
}

export function setShopSettings(db: AppDb, patch: Partial<ShopSettings>): ShopSettings {
  if (patch.shopName !== undefined) setSetting(db, SHOP_NAME_KEY, patch.shopName);
  if (patch.supportContact !== undefined) setSetting(db, SUPPORT_CONTACT_KEY, patch.supportContact);
  if (patch.aboutText !== undefined) setSetting(db, ABOUT_TEXT_KEY, patch.aboutText);
  if (patch.headerIcon !== undefined) {
    if (patch.headerIcon === "") {
      deleteSetting(db, HEADER_ICON_KEY);
    } else {
      setSetting(db, HEADER_ICON_KEY, patch.headerIcon);
    }
  }
  if (patch.headerTitle !== undefined) {
    if (patch.headerTitle === "") {
      deleteSetting(db, HEADER_TITLE_KEY);
    } else {
      setSetting(db, HEADER_TITLE_KEY, patch.headerTitle);
    }
  }
  return getShopSettings(db);
}

// --- Provider config overrides (model, base_url per provider) -----------

const PROVIDER_MODEL_KEY = (id: string) => `provider:${id}:model`;
const PROVIDER_BASE_URL_KEY = (id: string) => `provider:${id}:base_url`;

export interface ProviderOverrides {
  model: string | null;
  baseUrl: string | null;
}

export function getProviderOverrides(db: AppDb, providerId: string): ProviderOverrides {
  return {
    model: getSetting(db, PROVIDER_MODEL_KEY(providerId)),
    baseUrl: getSetting(db, PROVIDER_BASE_URL_KEY(providerId)),
  };
}

export function setProviderOverrides(db: AppDb, providerId: string, overrides: Partial<ProviderOverrides>): void {
  if (overrides.model !== undefined) {
    if (overrides.model === null) {
      deleteSetting(db, PROVIDER_MODEL_KEY(providerId));
    } else {
      setSetting(db, PROVIDER_MODEL_KEY(providerId), overrides.model);
    }
  }
  if (overrides.baseUrl !== undefined) {
    if (overrides.baseUrl === null) {
      deleteSetting(db, PROVIDER_BASE_URL_KEY(providerId));
    } else {
      setSetting(db, PROVIDER_BASE_URL_KEY(providerId), overrides.baseUrl);
    }
  }
}

// --- Payments toggle (runtime override of env.paymentsEnabled) ----------

const PAYMENTS_ENABLED_KEY = "payments_enabled";

export function getPaymentsEnabled(db: AppDb, envDefault: boolean): boolean {
  const val = getSetting(db, PAYMENTS_ENABLED_KEY);
  if (val === null) return envDefault;
  return val === "true";
}

export function setPaymentsEnabled(db: AppDb, enabled: boolean | null): void {
  if (enabled === null) {
    deleteSetting(db, PAYMENTS_ENABLED_KEY);
  } else {
    setSetting(db, PAYMENTS_ENABLED_KEY, enabled ? "true" : "false");
  }
}

// --- Open access toggle (bypass the allowlist) ---------------------------

const OPEN_ACCESS_KEY = "open_access";

/** When true, any Telegram user may use the bot/Mini App (allowlist bypassed). */
export function getOpenAccess(db: AppDb): boolean {
  return getSetting(db, OPEN_ACCESS_KEY) === "true";
}

export function setOpenAccess(db: AppDb, enabled: boolean | null): void {
  if (enabled === null) {
    deleteSetting(db, OPEN_ACCESS_KEY);
  } else {
    setSetting(db, OPEN_ACCESS_KEY, enabled ? "true" : "false");
  }
}

// --- Unified settings editor (all key-value pairs) ----------------------

export function getAllSettings(db: AppDb): SettingEntry[] {
  return db.query<SettingEntry, []>(`SELECT key, value FROM settings ORDER BY key`).all();
}

export function setSettingValue(db: AppDb, key: string, value: string | null): void {
  if (value === null) {
    deleteSetting(db, key);
  } else {
    setSetting(db, key, value);
  }
}

export function createSetting(db: AppDb, key: string, value: string): void {
  setSetting(db, key, value);
}
