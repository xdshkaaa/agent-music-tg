import { env } from "../env";

const BASE_URLS = {
  mainnet: "https://pay.crypt.bot/api",
  testnet: "https://testnet-pay.crypt.bot/api",
} as const;

export interface CryptoInvoice {
  invoice_id: number;
  status: "active" | "paid" | "expired";
  asset?: string;
  amount: string;
  pay_url?: string;
  bot_invoice_url?: string;
  mini_app_invoice_url?: string;
}

export class CryptoPayError extends Error {}
/** Thrown when the requested asset is not supported by Crypto Pay. */
export class UnsupportedAssetError extends CryptoPayError {
  constructor(asset: string) {
    super(`asset not supported by Crypto Pay: ${asset}`);
    this.asset = asset;
  }
  asset: string;
}

/** Assets accepted by the Crypto Pay API (see UNSUPPORTED_ASSET response). */
export const SUPPORTED_ASSETS = [
  "USDT",
  "TON",
  "SOL",
  "TRX",
  "BTC",
  "ETH",
  "DOGE",
  "LTC",
  "BNB",
  "USDC",
] as const;

export function isSupportedAsset(asset: string): boolean {
  return (SUPPORTED_ASSETS as readonly string[]).includes(asset.trim().toUpperCase());
}

function baseUrl(): string {
  return BASE_URLS[env.cryptobotNetwork as keyof typeof BASE_URLS] ?? BASE_URLS.mainnet;
}

function token(): string {
  if (!env.cryptobotToken) throw new CryptoPayError("CRYPTOBOT_TOKEN is not configured");
  return env.cryptobotToken;
}

async function call<T>(method: string, params?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${baseUrl()}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Crypto-Pay-API-Token": token(),
    },
    body: JSON.stringify(params ?? {}),
  });
  const body = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; error?: unknown } | null;
  if (!res.ok || !body?.ok) {
    throw new CryptoPayError(`Crypto Pay ${method} failed: ${JSON.stringify(body?.error ?? res.statusText)}`);
  }
  return body.result as T;
}

/** Creates an invoice for a fixed crypto amount/asset. Returns pay URL + id. */
export async function createInvoice(params: {
  asset: string;
  amount: string;
  description?: string;
  payload?: string;
}): Promise<CryptoInvoice> {
  const asset = params.asset.trim().toUpperCase();
  if (!isSupportedAsset(asset)) throw new UnsupportedAssetError(asset);
  return call<CryptoInvoice>("createInvoice", {
    asset,
    amount: params.amount,
    description: params.description,
    payload: params.payload,
  });
}

/** Fetches invoices by id (comma-separated) for the polling fallback. */
export async function getInvoices(invoiceIds: number[]): Promise<CryptoInvoice[]> {
  if (invoiceIds.length === 0) return [];
  const result = await call<{ items: CryptoInvoice[] }>("getInvoices", {
    invoice_ids: invoiceIds.join(","),
  });
  return result.items ?? [];
}
