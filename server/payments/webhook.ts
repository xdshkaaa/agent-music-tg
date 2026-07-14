import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env";

/**
 * Verifies a Crypto Pay webhook per their scheme: the signature is
 * HMAC-SHA256(rawBody) keyed by SHA256(app_token), hex-encoded, delivered in
 * the `crypto-pay-api-signature` header. Comparison is constant-time.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | undefined | null): boolean {
  if (!signature || !env.cryptobotToken) return false;
  const secret = createHash("sha256").update(env.cryptobotToken).digest();
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface WebhookUpdate {
  update_type?: string;
  payload?: {
    invoice_id?: number;
    status?: string;
  };
}
