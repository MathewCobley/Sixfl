import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { parseLondonDateTime, toLondonDateInputValue, toLondonTimeInputValue } from "@/lib/datetime/london";

export const PLAYER_PAYMENT_WARNING_SOURCE = "PLAYER_MATCH_FEE_WARNING";
export const WARNING_TEMPLATE_KEYS = { EMAIL: "player-match-fee-warning-email", SMS: "player-match-fee-warning-sms" } as const;
export type WarningChannel = keyof typeof WARNING_TEMPLATE_KEYS;
export class PaymentWarningError extends Error {}
export const WARNING_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const WARNING_PREVIEW_TTL_MS = 15 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

export function warningChannel(value: unknown): WarningChannel {
  if (value !== "EMAIL" && value !== "SMS") throw new PaymentWarningError("Choose email or SMS.");
  return value;
}
export function parseWarningDeadline(value: unknown, now = new Date()) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new PaymentWarningError("Choose a valid payment deadline in UK time.");
  const [day, time] = value.split("T");
  const result = parseLondonDateTime(day, time);
  const roundTrip = (date: Date) => `${toLondonDateInputValue(date)}T${toLondonTimeInputValue(date)}`;
  if (roundTrip(result) !== value) throw new PaymentWarningError("That date/time does not exist in the UK. Choose another deadline.");
  if ([-HOUR, HOUR].some(offset => roundTrip(new Date(result.getTime() + offset)) === value)) throw new PaymentWarningError("That UK time occurs twice when the clocks change. Choose a time after 02:00.");
  if (result.getTime() < now.getTime() + HOUR || result.getTime() > now.getTime() + 30 * 24 * HOUR) throw new PaymentWarningError("Choose a deadline at least one hour from now and within 30 days.");
  return result;
}
// JSONB may reorder object keys. Compare meaning, retaining array order, rather
// than rejecting an unchanged payment destination after its database round trip.
function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])]));
  return value;
}
export const warningFingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value)) ?? "null").digest("hex");
function secret() {
  const value = process.env.NEXTAUTH_SECRET?.trim();
  if (!value) throw new Error("Payment warning preview signing is not configured.");
  return value;
}
type PreviewTicket = { version: 1; actorId: string; feeId: string; channel: WarningChannel; deadline: string; fingerprint: string; requestId: string; expiresAt: number };
export function createWarningTicket(input: Omit<PreviewTicket, "version" | "requestId" | "expiresAt">, now = new Date()) {
  const payload = Buffer.from(JSON.stringify({ ...input, version: 1, requestId: randomUUID(), expiresAt: now.getTime() + WARNING_PREVIEW_TTL_MS })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret()).update(`player-payment-warning:${payload}`).digest("base64url")}`;
}
export function readWarningTicket(token: unknown, actorId: string, now = new Date()): PreviewTicket {
  if (typeof token !== "string" || token.length > 4096) throw new PaymentWarningError("Preview the warning before confirming it.");
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) throw new PaymentWarningError("Invalid warning preview. Please preview again.");
  const expected = createHmac("sha256", secret()).update(`player-payment-warning:${payload}`).digest("base64url");
  if (!/^[A-Za-z0-9_-]{43}$/.test(signature) || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new PaymentWarningError("Invalid warning preview. Please preview again.");
  let data: PreviewTicket;
  try { data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { throw new PaymentWarningError("Invalid warning preview."); }
  if (data.version !== 1 || data.actorId !== actorId || !data.feeId || !data.requestId || !data.fingerprint || !Number.isFinite(data.expiresAt)) throw new PaymentWarningError("This preview does not belong to your admin session.");
  warningChannel(data.channel);
  if (!Number.isFinite(new Date(data.deadline).getTime()) || data.expiresAt <= now.getTime()) throw new PaymentWarningError("This preview has expired. Please preview again.");
  return data;
}
