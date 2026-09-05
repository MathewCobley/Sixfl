// Payment order only: amounts and settlement come from the authoritative team ledger.
export type PaymentOrderEntry = {
  chargeId: string;
  teamId: string;
  fixtureId: string | null;
  title: string;
  paymentToken: string | null;
  dueDate: Date | null;
  kickoffAt: Date | null;
  createdAt: Date;
  outstandingPence: number;
  displayStatus: string;
};

export type PaymentOrderException = {
  chargeId: string;
  action: "HOLD" | "ALLOW_PAYMENT" | "RESET";
  reason: string;
  expiresAt: Date | null;
};

export type PaymentOrderDecision = {
  allowed: boolean;
  code: "NEXT" | "EXEMPT" | "OVERRIDE" | "OLDER_BALANCE" | "ON_HOLD" | "SETTLED" | "UNAVAILABLE";
  blocker: PaymentOrderEntry | null;
};

export function paymentOrderDate(entry: PaymentOrderEntry) {
  return entry.dueDate ?? entry.kickoffAt ?? entry.createdAt;
}

export function comparePaymentOrder(a: PaymentOrderEntry, b: PaymentOrderEntry) {
  return paymentOrderDate(a).getTime() - paymentOrderDate(b).getTime()
    || a.createdAt.getTime() - b.createdAt.getTime()
    || a.chargeId.localeCompare(b.chargeId);
}

export function isOutstandingOrderEntry(entry: PaymentOrderEntry) {
  return entry.displayStatus !== "VOID" && entry.displayStatus !== "PAID" && entry.outstandingPence > 0;
}

export function activePaymentOrderExceptions(exceptions: PaymentOrderException[], now = new Date()) {
  return new Map(exceptions.filter(item => item.action !== "RESET" && item.expiresAt && item.expiresAt > now)
    .map(item => [item.chargeId, item]));
}

export function oldestPaymentOrderEntry(
  entries: PaymentOrderEntry[], exceptions: Map<string, PaymentOrderException>,
) {
  return entries.filter(entry => isOutstandingOrderEntry(entry) && exceptions.get(entry.chargeId)?.action !== "HOLD")
    .sort(comparePaymentOrder)[0] ?? null;
}

export function decideTeamPaymentOrder(input: {
  entries: PaymentOrderEntry[];
  eligibleChargeIds: Set<string>;
  unavailableChargeIds: Set<string>;
  exceptions: Map<string, PaymentOrderException>;
  enabled: boolean;
  chargeId: string;
}): PaymentOrderDecision {
  const entry = input.entries.find(item => item.chargeId === input.chargeId);
  if (!entry || input.unavailableChargeIds.has(input.chargeId)) {
    return { allowed: false, code: "UNAVAILABLE", blocker: null };
  }
  if (!isOutstandingOrderEntry(entry)) return { allowed: false, code: "SETTLED", blocker: null };
  // Managed squad history and conversion boundaries must not become standard-team debt.
  if (!input.enabled || !input.eligibleChargeIds.has(entry.chargeId)) {
    return { allowed: true, code: "EXEMPT", blocker: null };
  }
  const exception = input.exceptions.get(entry.chargeId);
  if (exception?.action === "HOLD") return { allowed: false, code: "ON_HOLD", blocker: null };
  if (exception?.action === "ALLOW_PAYMENT") return { allowed: true, code: "OVERRIDE", blocker: null };
  const oldest = oldestPaymentOrderEntry(input.entries.filter(item => input.eligibleChargeIds.has(item.chargeId)), input.exceptions);
  if (oldest && oldest.chargeId !== entry.chargeId) {
    return { allowed: false, code: "OLDER_BALANCE", blocker: oldest };
  }
  return { allowed: true, code: "NEXT", blocker: null };
}

function londonDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function overduePaymentOrderEntries(entries: PaymentOrderEntry[], now = new Date()) {
  const today = londonDateKey(now);
  return entries.filter(entry => isOutstandingOrderEntry(entry) && londonDateKey(paymentOrderDate(entry)) < today);
}

export function paymentOrderMessage(decision: PaymentOrderDecision) {
  if (decision.code === "OLDER_BALANCE" && decision.blocker) {
    const amount = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(decision.blocker.outstandingPence / 100);
    return `Please clear your earlier balance first: ${amount} remains outstanding for ${decision.blocker.title}.`;
  }
  if (decision.code === "ON_HOLD") return "SIXFL has put direct payment of this charge on hold. Please contact SIXFL.";
  if (decision.code === "SETTLED") return "This charge is already settled; no further direct payment is required.";
  return "This charge is not currently available for direct payment.";
}
