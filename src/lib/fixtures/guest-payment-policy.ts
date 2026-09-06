import { GuestApprovalError, type GuestApprovalAccess } from "./guest-approval-policy";

export function canManageGuestPayments(access: GuestApprovalAccess) {
  return Boolean(access.session && access.user?.id && access.accessMode === "captain" &&
    ((access.isAdmin && access.user.role === "ADMIN") ||
      (access.isCaptain && access.user.role !== "ADMIN")));
}

export function assertGuestPaymentAccess(access: GuestApprovalAccess) {
  if (!canManageGuestPayments(access)) {
    throw new GuestApprovalError("Open this team as its captain or in full SIXFL admin view to manage guest payments.", 403);
  }
}

export function guestPaymentId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,150}$/.test(value)) {
    throw new GuestApprovalError("Choose a valid approved guest and fixture.");
  }
  return value;
}

export function parseGuestAmount(value: unknown): number {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/.test(value.trim())) {
    throw new GuestApprovalError("Enter a fee from £0 to £100 with no more than two decimal places.");
  }
  const [whole, fraction = ""] = value.trim().split(".");
  const pence = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (pence > 10000) throw new GuestApprovalError("The guest fee must be between £0 and £100.");
  return pence;
}

export type GuestPaymentInput = {
  approvalId: string; fixtureId: string; action: "create" | "send";
  amountPence: number | null; feeId: string | null;
  expectedRevision: number; expectedKickoffAt: string;
};

export function parseGuestPayment(value: unknown): GuestPaymentInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new GuestApprovalError("Choose an approved guest first.");
  const data = value as Record<string, unknown>;
  if (data.action !== "create" && data.action !== "send") throw new GuestApprovalError("Choose create fee or send link.");
  if (!Number.isSafeInteger(data.expectedRevision) || Number(data.expectedRevision) < 1 ||
      typeof data.expectedKickoffAt !== "string" || !Number.isFinite(Date.parse(data.expectedKickoffAt))) {
    throw new GuestApprovalError("Reload this guest before setting their fee.", 409);
  }
  return {
    approvalId: guestPaymentId(data.approvalId), fixtureId: guestPaymentId(data.fixtureId),
    action: data.action, amountPence: data.action === "create" ? parseGuestAmount(data.amount) : null,
    feeId: data.action === "send" ? guestPaymentId(data.feeId) : null,
    expectedRevision: Number(data.expectedRevision), expectedKickoffAt: data.expectedKickoffAt,
  };
}

export async function readGuestPayment(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new GuestApprovalError("Send a JSON payment request.", 415);
  }
  const limit = 4096;
  if (Number(request.headers.get("content-length")) > limit) throw new GuestApprovalError("Payment request too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new GuestApprovalError("Payment request is empty.");
  let text = ""; let bytes = 0;
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw new GuestApprovalError("Payment request too large.", 413); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new GuestApprovalError("Payment request could not be read."); }
  return parseGuestPayment(value);
}

export function guestFixtureAcceptsPayment(status: string, kickoffAt: Date, now = new Date()) {
  return (status === "SCHEDULED" && kickoffAt > now) ||
    (status === "COMPLETED" && kickoffAt <= now && kickoffAt.getTime() >= now.getTime() - 30 * 86400000);
}
