// ========================================
// File: src/app/(admin)/admin/payments/subscriptions/page.tsx
// ========================================

import Link from "next/link";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { listTeamSubscriptionSnapshots } from "@/lib/payments/team-subscriptions";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin Payment Subscriptions | SIXFL",
};

function formatDate(value: Date | null) {
  if (!value) return "—";

  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: Date | null) {
  if (!value) return "—";

  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatStatus(status: string | null) {
  if (!status) return "Not set up";

  const labels: Record<string, string> = {
    active: "Active",
    trialing: "Trialling",
    past_due: "Past due",
    unpaid: "Unpaid",
    incomplete: "Setup incomplete",
    incomplete_expired: "Setup expired",
    canceled: "Cancelled",
    paused: "Paused",
  };

  return labels[status] ?? status.replaceAll("_", " ");
}

function getStatusTone(status: string | null) {
  switch (status) {
    case "active":
    case "trialing":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    case "canceled":
    case "incomplete_expired":
      return "border-red-400/25 bg-red-500/10 text-red-100";
    default:
      return "border-white/10 bg-white/[0.05] text-white/60";
  }
}

function maskStripeId(value: string | null) {
  if (!value) return "—";
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export default async function AdminPaymentSubscriptionsPage() {
  await requireAdmin();

  const subscriptions = await listTeamSubscriptionSnapshots();
  const activeCount = subscriptions.filter((item) =>
    ["active", "trialing"].includes(item.subscriptionStatus ?? ""),
  ).length;
  const attentionCount = subscriptions.filter((item) =>
    ["past_due", "unpaid", "incomplete"].includes(item.subscriptionStatus ?? ""),
  ).length;
  const failedCount = subscriptions.filter(
    (item) => item.subscriptionLastPaymentFailedAt,
  ).length;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/75">
            Payments
          </p>
          <h1 className="text-3xl font-semibold text-white">
            Recurring subscriptions
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-white/60">
            Simple Stripe subscription tracking for teams. Successful Stripe renewal invoices are recorded as payment transactions.
          </p>
        </div>

        <Link
          href="/admin/payments"
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-white/75 transition hover:bg-white/[0.07] hover:text-white"
        >
          Back to payments
        </Link>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
            Subscriptions
          </div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {subscriptions.length}
          </div>
          <p className="mt-2 text-sm text-white/50">Teams with Stripe subscription data.</p>
        </div>

        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
            Active
          </div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {activeCount}
          </div>
          <p className="mt-2 text-sm text-emerald-100/75">Active or trialling.</p>
        </div>

        <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-100/70">
            Needs attention
          </div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {attentionCount}
          </div>
          <p className="mt-2 text-sm text-amber-100/75">Past due, unpaid, or incomplete.</p>
        </div>

        <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-red-100/70">
            Failed payment marker
          </div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {failedCount}
          </div>
          <p className="mt-2 text-sm text-red-100/75">Teams with a recorded failed invoice.</p>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Team subscriptions</h2>
            <p className="mt-1 text-sm text-white/55">
              Stripe remains the source of truth. This screen shows what SIXFL has recorded from webhooks.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {subscriptions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-8 text-sm text-white/55">
              No recurring subscriptions have been recorded yet.
            </div>
          ) : null}

          {subscriptions.map((item) => (
            <div key={item.id} className="rounded-2xl border border-white/10 bg-[#0d1428] p-4">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/teams/${item.id}`}
                      className="text-base font-semibold text-white transition hover:text-emerald-200"
                    >
                      {item.name}
                    </Link>
                    <span
                      className={[
                        "inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                        getStatusTone(item.subscriptionStatus),
                      ].join(" ")}
                    >
                      {formatStatus(item.subscriptionStatus)}
                    </span>
                  </div>

                  <div className="mt-1 text-sm text-white/55">
                    {item.leagueName
                      ? `${item.leagueName}${item.leagueSeason ? ` · ${item.leagueSeason}` : ""}`
                      : "No league assigned"}
                  </div>

                  <div className="mt-3 grid gap-2 text-xs text-white/45 sm:grid-cols-2 lg:grid-cols-3">
                    <div>Customer: {maskStripeId(item.stripeCustomerId)}</div>
                    <div>Subscription: {maskStripeId(item.stripeSubscriptionId)}</div>
                    <div>Price: {maskStripeId(item.subscriptionPriceId)}</div>
                  </div>
                </div>

                <div className="grid gap-3 text-sm text-white/60 sm:grid-cols-2 xl:min-w-[520px] xl:grid-cols-4 xl:text-right">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">
                      Next renewal
                    </div>
                    <div className="mt-1 text-white/80">
                      {formatDate(item.subscriptionCurrentPeriodEnd)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">
                      Last paid
                    </div>
                    <div className="mt-1 text-white/80">
                      {formatDateTime(item.subscriptionLastPaymentAt)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">
                      Last failed
                    </div>
                    <div className={[
                      "mt-1",
                      item.subscriptionLastPaymentFailedAt ? "text-red-200" : "text-white/80",
                    ].join(" ")}
                    >
                      {formatDateTime(item.subscriptionLastPaymentFailedAt)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">
                      Cancelled
                    </div>
                    <div className="mt-1 text-white/80">
                      {formatDateTime(item.subscriptionCancelledAt)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
