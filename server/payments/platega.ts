import { timingSafeEqual } from "node:crypto";
import { env } from "../env";

const BASE_URL = "https://app.platega.io";

/** paymentMethod code for СБП (Fast Payment System) QR. */
const PAYMENT_METHOD_SBP = 2;

export class PlategaError extends Error {}

export interface PlategaTransaction {
  transactionId: string;
  redirect: string;
  status: string;
}

export function plategaEnabled(): boolean {
  return Boolean(env.plategaMerchantId && env.plategaSecret);
}

function headers(): Record<string, string> {
  if (!plategaEnabled()) throw new PlategaError("Platega is not configured");
  return {
    "Content-Type": "application/json",
    "X-MerchantId": env.plategaMerchantId,
    "X-Secret": env.plategaSecret,
  };
}

/** Creates a СБП QR payment. Link is valid ~15 minutes. */
export async function createTransaction(params: {
  amountRub: number;
  description: string;
  payload: string;
  returnUrl: string;
  failedUrl: string;
}): Promise<PlategaTransaction> {
  const res = await fetch(`${BASE_URL}/transaction/process`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      paymentMethod: PAYMENT_METHOD_SBP,
      paymentDetails: { amount: params.amountRub, currency: "RUB" },
      description: params.description,
      return: params.returnUrl,
      failedUrl: params.failedUrl,
      payload: params.payload,
    }),
  });
  const body = (await res.json().catch(() => null)) as
    | { transactionId?: string; redirect?: string; status?: string }
    | null;
  if (!res.ok || !body?.transactionId || !body?.redirect) {
    throw new PlategaError(`Platega createTransaction failed: ${JSON.stringify(body ?? res.statusText)}`);
  }
  return { transactionId: body.transactionId, redirect: body.redirect, status: body.status ?? "PENDING" };
}

/** Polls transaction status — fallback for hosts with no public webhook URL. */
export async function getTransaction(id: string): Promise<{ id: string; status: string }> {
  const res = await fetch(`${BASE_URL}/transaction/${id}`, {
    method: "GET",
    headers: headers(),
  });
  const body = (await res.json().catch(() => null)) as { id?: string; status?: string } | null;
  if (!res.ok || !body?.status) {
    throw new PlategaError(`Platega getTransaction failed: ${JSON.stringify(body ?? res.statusText)}`);
  }
  return { id: body.id ?? id, status: body.status };
}

/**
 * Verifies a Platega webhook: both X-MerchantId and X-Secret headers must
 * match the configured credentials, compared in constant time.
 */
export function verifyPlategaCallback(merchantIdHeader: string | undefined | null, secretHeader: string | undefined | null): boolean {
  if (!plategaEnabled() || !merchantIdHeader || !secretHeader) return false;
  const merchantOk = safeEqual(merchantIdHeader, env.plategaMerchantId);
  const secretOk = safeEqual(secretHeader, env.plategaSecret);
  return merchantOk && secretOk;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export interface PlategaWebhookBody {
  id?: string;
  amount?: number;
  currency?: string;
  status?: "CONFIRMED" | "CANCELED" | "CHARGEBACKED" | string;
  paymentMethod?: number;
  payload?: string;
}
