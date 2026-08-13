// ========================================
// File: src/app/(admin)/admin/payments/stripe-reconciliation/page.tsx
// ========================================

import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getStripeServerClient } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Stripe Payment Reconciliation | SIXFL Admin",
};

type StripeTransactionRow = {
  id: string;
  teamId: string;
  teamName: string;
  chargeId: string | null;
  chargeTitle: string | null;
  amountPence: number;
  reference: string | null;
  notes: string | null;
  paidAt: Date;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
  playerMatchFeeId: string | null;
};

type AuditStatus =
  | "VERIFIED_PAID"
  | "NOT_PAID"
  | "NEEDS_REVIEW"
  | "UNVERIFIABLE";

type AuditRow = StripeTransactionRow & {
  paymentIntentId: string | null;
  stripeStatus: string | null;
  amountReceivedPence: number | null;
  auditStatus: AuditStatus;
  verificationSource: string | null;
  reason: string;
};

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(value);
}

function getPaymentIntentId(row: StripeTransactionRow) {
  if (row.stripePaymentIntentId?.startsWith("pi_")) {
    return row.stripePaymentIntentId;
  }
  if (row.reference?.startsWith("pi_")) {
    return row.reference;
  }
  return null;
}

function getCheckoutSessionId(row: StripeTransactionRow) {
  if (row.stripeCheckoutSessionId?.startsWith("cs_")) {
    return row.stripeCheckoutSessionId;
  }
  if (row.reference?.startsWith("cs_")) {
    return row.reference;
  }
  return null;
}

function getChargeId(row: StripeTransactionRow) {
  if (row.stripeChargeId?.startsWith("ch_")) {
    return row.stripeChargeId;
  }
  if (row.reference?.startsWith("ch_")) {
    return row.reference;
  }
  return null;
}

function statusClasses(status: AuditStatus) {
  if (status === "VERIFIED_PAID") {
    return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
  }
  if (status === "NOT_PAID") {
    return "border-red-400/25 bg-red-500/10 text-red-100";
  }
  if (status === "UNVERIFIABLE") {
    return "border-white/15 bg-white/[0.05] text-white/65";
  }
  return "border-amber-400/25 bg-amber-500/10 text-amber-100";
}

function statusLabel(status: AuditStatus) {
  if (status === "VERIFIED_PAID") return "Verified paid";
  if (status === "NOT_PAID") return "NOT paid";
  if (status === "UNVERIFIABLE") return "Legacy / unverifiable";
  return "Needs review";
}

async function verifyRow(row: StripeTransactionRow): Promise<AuditRow> {
  const stripe = getStripeServerClient();
  let paymentIntentId = getPaymentIntentId(row);
  const checkoutSessionId = getCheckoutSessionId(row);
  const chargeId = getChargeId(row);

  // Older SIXFL transactions often retained the Checkout Session but not the
  // PaymentIntent ID. Resolve the PaymentIntent through Stripe before treating
  // the row as an exception.
  if (!paymentIntentId && checkoutSessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);
      paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null;

      if (!paymentIntentId) {
        const checkoutAmountPence = session.amount_total ?? null;

        if (
          session.payment_status === "paid" &&
          checkoutAmountPence !== null &&
          checkoutAmountPence >= row.amountPence
        ) {
          return {
            ...row,
            paymentIntentId: null,
            stripeStatus: session.payment_status,
            amountReceivedPence: checkoutAmountPence,
            auditStatus: "VERIFIED_PAID",
            verificationSource: "Checkout session",
            reason:
              "Stripe Checkout confirms this older payment is paid and the Checkout amount covers the SIXFL transaction.",
          };
        }

        if (session.payment_status === "unpaid") {
          return {
            ...row,
            paymentIntentId: null,
            stripeStatus: session.payment_status,
            amountReceivedPence: 0,
            auditStatus: "NOT_PAID",
            verificationSource: "Checkout session",
            reason:
              "SIXFL recorded this as paid, but Stripe Checkout says the session is unpaid.",
          };
        }

        return {
          ...row,
          paymentIntentId: null,
          stripeStatus: session.payment_status,
          amountReceivedPence: checkoutAmountPence,
          auditStatus: "NEEDS_REVIEW",
          verificationSource: "Checkout session",
          reason:
            "Stripe Checkout was found, but it does not contain enough information to verify the recorded payment safely.",
        };
      }
    } catch (error) {
      return {
        ...row,
        paymentIntentId: null,
        stripeStatus: null,
        amountReceivedPence: null,
        auditStatus: "NEEDS_REVIEW",
        verificationSource: "Checkout session",
        reason:
          error instanceof Error
            ? `Stripe Checkout lookup failed: ${error.message}`
            : "Stripe Checkout lookup failed.",
      };
    }
  }

  // Some legacy rows retained the Stripe Charge ID instead of the PaymentIntent.
  if (!paymentIntentId && !checkoutSessionId && chargeId) {
    try {
      const charge = await stripe.charges.retrieve(chargeId);
      const amountReceivedPence = charge.amount_captured ?? 0;

      if (!charge.paid) {
        return {
          ...row,
          paymentIntentId: null,
          stripeStatus: charge.status,
          amountReceivedPence,
          auditStatus: "NOT_PAID",
          verificationSource: "Stripe charge",
          reason:
            "SIXFL recorded this as paid, but the Stripe charge is not marked as paid.",
        };
      }

      if (amountReceivedPence < row.amountPence) {
        return {
          ...row,
          paymentIntentId: null,
          stripeStatus: charge.status,
          amountReceivedPence,
          auditStatus: "NEEDS_REVIEW",
          verificationSource: "Stripe charge",
          reason: `Stripe charge was paid, but amount captured (${formatMoney(amountReceivedPence)}) is below the SIXFL transaction (${formatMoney(row.amountPence)}).`,
        };
      }

      return {
        ...row,
        paymentIntentId: null,
        stripeStatus: charge.status,
        amountReceivedPence,
        auditStatus: "VERIFIED_PAID",
        verificationSource: "Stripe charge",
        reason:
          "Stripe confirms this legacy charge was paid and captured at least the amount SIXFL recorded.",
      };
    } catch (error) {
      return {
        ...row,
        paymentIntentId: null,
        stripeStatus: null,
        amountReceivedPence: null,
        auditStatus: "NEEDS_REVIEW",
        verificationSource: "Stripe charge",
        reason:
          error instanceof Error
            ? `Stripe charge lookup failed: ${error.message}`
            : "Stripe charge lookup failed.",
      };
    }
  }

  if (!paymentIntentId) {
    return {
      ...row,
      paymentIntentId: null,
      stripeStatus: null,
      amountReceivedPence: null,
      auditStatus: "UNVERIFIABLE",
      verificationSource: null,
      reason:
        "This is an older SIXFL Stripe transaction with no usable PaymentIntent, Checkout Session or Charge ID stored. It is not being counted as a payment discrepancy.",
    };
  }

  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const amountReceivedPence = intent.amount_received ?? 0;

    if (intent.status !== "succeeded") {
      return {
        ...row,
        paymentIntentId,
        stripeStatus: intent.status,
        amountReceivedPence,
        auditStatus: "NOT_PAID",
        verificationSource: "PaymentIntent",
        reason: `SIXFL recorded this as paid, but Stripe PaymentIntent status is ${intent.status}.`,
      };
    }

    if (amountReceivedPence < row.amountPence) {
      return {
        ...row,
        paymentIntentId,
        stripeStatus: intent.status,
        amountReceivedPence,
        auditStatus: "NEEDS_REVIEW",
        verificationSource: "PaymentIntent",
        reason: `Stripe succeeded, but amount received (${formatMoney(amountReceivedPence)}) is below the SIXFL transaction (${formatMoney(row.amountPence)}).`,
      };
    }

    return {
      ...row,
      paymentIntentId,
      stripeStatus: intent.status,
      amountReceivedPence,
      auditStatus: "VERIFIED_PAID",
      verificationSource: "PaymentIntent",
      reason:
        "Stripe confirms the PaymentIntent succeeded and received the recorded amount.",
    };
  } catch (error) {
    return {
      ...row,
      paymentIntentId,
      stripeStatus: null,
      amountReceivedPence: null,
      auditStatus: "NEEDS_REVIEW",
      verificationSource: "PaymentIntent",
      reason:
        error instanceof Error
          ? `Stripe PaymentIntent lookup failed: ${error.message}`
          : "Stripe PaymentIntent lookup failed.",
    };
  }
}

export default async function StripePaymentReconciliationPage() {
  await requireAdmin();

  // PaymentTransaction.playerMatchFeeId was introduced through a compatibility
  // migration before it was represented in every generated Prisma client, so use
  // a raw query here. This page is deliberately read-only.
  const transactions = await prisma.$queryRaw<StripeTransactionRow[]>`
    SELECT
      transaction."id",
      transaction."teamId",
      team."name" AS "teamName",
      transaction."chargeId",
      charge."title" AS "chargeTitle",
      transaction."amountPence",
      transaction."reference",
      transaction."notes",
      transaction."paidAt",
      transaction."stripeCheckoutSessionId",
      transaction."stripePaymentIntentId",
      transaction."stripeChargeId",
      transaction."playerMatchFeeId"
    FROM "PaymentTransaction" transaction
    INNER JOIN "Team" team ON team."id" = transaction."teamId"
    LEFT JOIN "PaymentCharge" charge ON charge."id" = transaction."chargeId"
    WHERE transaction."method" = 'STRIPE'::"PaymentMethod"
    ORDER BY transaction."paidAt" DESC
    LIMIT 250
  `;

  const auditRows: AuditRow[] = [];
  const chunkSize = 12;
  for (let index = 0; index < transactions.length; index += chunkSize) {
    const chunk = transactions.slice(index, index + chunkSize);
    auditRows.push(...(await Promise.all(chunk.map(verifyRow))));
  }

  const verifiedRows = auditRows.filter(
    (row) => row.auditStatus === "VERIFIED_PAID",
  );
  const notPaidRows = auditRows.filter((row) => row.auditStatus === "NOT_PAID");
  const reviewRows = auditRows.filter(
    (row) => row.auditStatus === "NEEDS_REVIEW",
  );
  const unverifiableRows = auditRows.filter(
    (row) => row.auditStatus === "UNVERIFIABLE",
  );
  const falsePaidPence = notPaidRows.reduce(
    (sum, row) => sum + row.amountPence,
    0,
  );

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-emerald-400/15 bg-white/[0.04] p-6 lg:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
          Back end functions
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
          Stripe payment reconciliation
        </h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-white/65">
          This is a read-only audit. SIXFL transactions marked as Stripe payments are checked against Stripe itself. Current records are verified from the PaymentIntent; older records also fall back to their Checkout Session or Stripe Charge when available.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/admin/payments"
            className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-semibold text-white/75"
          >
            Back to payments
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Checked
          </p>
          <p className="mt-3 text-3xl font-semibold text-white">{auditRows.length}</p>
          <p className="mt-2 text-sm text-white/50">Most recent Stripe transactions.</p>
        </div>
        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
            Verified paid
          </p>
          <p className="mt-3 text-3xl font-semibold text-white">{verifiedRows.length}</p>
          <p className="mt-2 text-sm text-white/50">Stripe confirms payment.</p>
        </div>
        <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-100/70">
            Recorded but NOT paid
          </p>
          <p className="mt-3 text-3xl font-semibold text-white">{notPaidRows.length}</p>
          <p className="mt-2 text-sm text-red-50/70">
            {formatMoney(falsePaidPence)} recorded in SIXFL.
          </p>
        </div>
        <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">
            Needs review
          </p>
          <p className="mt-3 text-3xl font-semibold text-white">{reviewRows.length}</p>
          <p className="mt-2 text-sm text-white/50">Lookup error or amount mismatch.</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Legacy / unverifiable
          </p>
          <p className="mt-3 text-3xl font-semibold text-white">
            {unverifiableRows.length}
          </p>
          <p className="mt-2 text-sm text-white/50">No usable Stripe ID retained.</p>
        </div>
      </section>

      {notPaidRows.length > 0 ? (
        <section className="rounded-3xl border border-red-400/25 bg-red-500/[0.07] p-5 lg:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-100/70">
            Action required
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            SIXFL contains Stripe payments that Stripe says did not succeed
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-red-50/70">
            Do not delete these manually. They should be repaired transaction-by-transaction so the team/player balance is recalculated correctly and an audit trail is retained.
          </p>
        </section>
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 lg:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Audit results</h2>
            <p className="mt-1 text-sm text-white/50">
              Newest Stripe transactions first. This page changes no financial records.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {auditRows.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/55">
              No Stripe PaymentTransaction rows were found.
            </div>
          ) : null}

          {auditRows.map((row) => {
            const paymentKind =
              row.playerMatchFeeId || row.notes?.includes("Player fee ID:")
                ? "Player payment"
                : "Team payment";

            return (
              <div
                key={row.id}
                className="grid gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 xl:grid-cols-[1fr_auto] xl:items-start"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(row.auditStatus)}`}
                    >
                      {statusLabel(row.auditStatus)}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/60">
                      {paymentKind}
                    </span>
                    <span className="text-sm font-semibold text-white">{row.teamName}</span>
                  </div>

                  <div className="mt-3 grid gap-1 text-sm text-white/60">
                    <div>
                      Recorded amount:{" "}
                      <strong className="text-white">{formatMoney(row.amountPence)}</strong>
                    </div>
                    {row.amountReceivedPence !== null ? (
                      <div>
                        Stripe amount received:{" "}
                        <strong className="text-white">
                          {formatMoney(row.amountReceivedPence)}
                        </strong>
                      </div>
                    ) : null}
                    <div>Recorded by SIXFL: {formatDateTime(row.paidAt)}</div>
                    {row.chargeTitle ? <div>Charge: {row.chargeTitle}</div> : null}
                    {row.playerMatchFeeId ? (
                      <div>Player fee ID: {row.playerMatchFeeId}</div>
                    ) : null}
                    <div className="break-all">
                      PaymentIntent: {row.paymentIntentId || "Not stored"}
                    </div>
                    {row.verificationSource ? (
                      <div>Verified using: {row.verificationSource}</div>
                    ) : null}
                    <div>
                      Stripe status:{" "}
                      <strong className="text-white">{row.stripeStatus || "Unknown"}</strong>
                    </div>
                  </div>

                  <div
                    className={`mt-3 rounded-xl border px-3 py-2 text-sm leading-5 ${statusClasses(row.auditStatus)}`}
                  >
                    {row.reason}
                  </div>
                </div>

                <div className="text-xs text-white/35 xl:text-right">
                  SIXFL transaction
                  <br />
                  <span className="break-all">{row.id}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
