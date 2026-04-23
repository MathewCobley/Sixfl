// ========================================
// File: src/app/(admin)/admin/payments/page.tsx
// ========================================

import Link from "next/link";
import { PaymentMethod } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import FormListboxField from "@/components/ui/FormListboxField";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { summariseCharge } from "@/lib/payments/charge-status";
import { cancelQueuedMatchFeeNotificationDispatches } from "@/lib/payments/fixture-match-fees";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin Payments | SIXFL",
};

const paymentMethodValues = new Set<PaymentMethod>(Object.values(PaymentMethod));
const ADMIN_CHASE_THRESHOLD_MS = 72 * 60 * 60 * 1000;

function isPaymentMethod(value: string): value is PaymentMethod {
  return paymentMethodValues.has(value as PaymentMethod);
}

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function formatPaymentMethodLabel(method: PaymentMethod) {
  const labels: Record<PaymentMethod, string> = {
    [PaymentMethod.BANK_TRANSFER]: "Bank transfer",
    [PaymentMethod.STRIPE]: "Stripe",
    [PaymentMethod.CASH]: "Cash",
    [PaymentMethod.CARD]: "Card",
    [PaymentMethod.OTHER]: "Other",
  };

  return labels[method];
}

function formatDateTimeLabel(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDueLabel(value: Date | null) {
  if (!value) return "No due date";

  if (
    value.getUTCHours() === 0 &&
    value.getUTCMinutes() === 0 &&
    value.getUTCSeconds() === 0 &&
    value.getUTCMilliseconds() === 0
  ) {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(value);
  }

  return formatDateTimeLabel(value);
}

const methodOptions = [
  { value: PaymentMethod.BANK_TRANSFER, label: "Bank transfer" },
  { value: PaymentMethod.STRIPE, label: "Stripe" },
  { value: PaymentMethod.CASH, label: "Cash" },
  { value: PaymentMethod.CARD, label: "Card" },
  { value: PaymentMethod.OTHER, label: "Other" },
];

async function createChargeAction(formData: FormData) {
  "use server";

  await requireAdmin();

  const teamId = String(formData.get("teamId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const amountPounds = Number(formData.get("amountPounds") ?? "0");
  const dueDateValue = String(formData.get("dueDate") ?? "").trim();

  if (!teamId || !title || !Number.isFinite(amountPounds) || amountPounds <= 0) {
    redirect("/admin/payments?error=invalid_charge");
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, leagueId: true },
  });

  if (!team) {
    redirect("/admin/payments?error=missing_team");
  }

  await prisma.paymentCharge.create({
    data: {
      teamId,
      leagueId: team.leagueId,
      title,
      description: description || null,
      amountPence: Math.round(amountPounds * 100),
      dueDate: dueDateValue ? new Date(dueDateValue) : null,
    },
  });

  revalidatePath("/admin/payments");
  redirect("/admin/payments?created=charge");
}

async function recordPaymentAction(formData: FormData) {
  "use server";

  await requireAdmin();

  const teamId = String(formData.get("teamId") ?? "");
  const chargeId = String(formData.get("chargeId") ?? "").trim();
  const amountPounds = Number(formData.get("amountPounds") ?? "0");
  const methodValue = String(
    formData.get("method") ?? PaymentMethod.BANK_TRANSFER,
  );
  const method = isPaymentMethod(methodValue)
    ? methodValue
    : PaymentMethod.BANK_TRANSFER;
  const reference = String(formData.get("reference") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const paidAtValue = String(formData.get("paidAt") ?? "").trim();

  if (!teamId || !Number.isFinite(amountPounds) || amountPounds <= 0 || !paidAtValue) {
    redirect("/admin/payments?error=invalid_payment");
  }

  await prisma.paymentTransaction.create({
    data: {
      teamId,
      chargeId: chargeId || null,
      amountPence: Math.round(amountPounds * 100),
      method,
      reference: reference || null,
      notes: notes || null,
      paidAt: new Date(paidAtValue),
    },
  });

  if (chargeId) {
    const charge = await prisma.paymentCharge.findUnique({
      where: { id: chargeId },
      include: {
        transactions: {
          select: {
            amountPence: true,
          },
        },
      },
    });

    if (charge) {
      const summary = summariseCharge({
        amountPence: charge.amountPence,
        transactions: charge.transactions,
      });

      await prisma.paymentCharge.update({
        where: { id: chargeId },
        data: {
          status: summary.status,
        },
      });

      if (summary.status === "PAID") {
        await cancelQueuedMatchFeeNotificationDispatches([chargeId]);
      }
    }
  }

  revalidatePath("/admin/payments");
  redirect("/admin/payments?created=payment");
}

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    created?: string;
    error?: string;
  }>;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};

  const [teams, charges, transactions] = await Promise.all([
    prisma.team.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        league: {
          select: {
            name: true,
            season: true,
          },
        },
      },
    }),
    prisma.paymentCharge.findMany({
      orderBy: [{ createdAt: "desc" }],
      include: {
        team: {
          select: {
            id: true,
            name: true,
          },
        },
        transactions: {
          select: {
            amountPence: true,
          },
        },
      },
    }),
    prisma.paymentTransaction.findMany({
      orderBy: [{ paidAt: "desc" }],
      include: {
        team: {
          select: {
            id: true,
            name: true,
          },
        },
        charge: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      take: 20,
    }),
  ]);

  const nowMs = Date.now();

  const chargeRows = charges
    .map((charge) => {
      const summary = summariseCharge({
        amountPence: charge.amountPence,
        transactions: charge.transactions,
      });

      const isClosed = charge.status === "PAID" || charge.status === "VOID";

      const needsAdminChase =
        !isClosed &&
        summary.outstandingPence > 0 &&
        !!charge.dueDate &&
        charge.dueDate.getTime() + ADMIN_CHASE_THRESHOLD_MS <= nowMs;

      return {
        charge,
        summary,
        needsAdminChase,
      };
    })
    .sort((a, b) => {
      if (a.needsAdminChase !== b.needsAdminChase) {
        return a.needsAdminChase ? -1 : 1;
      }

      if (a.summary.outstandingPence !== b.summary.outstandingPence) {
        return b.summary.outstandingPence - a.summary.outstandingPence;
      }

      return b.charge.createdAt.getTime() - a.charge.createdAt.getTime();
    });

  const teamOptions = teams.map((team) => ({
    value: team.id,
    label: team.league?.name
      ? `${team.name} · ${team.league.name}${team.league.season ? ` ${team.league.season}` : ""}`
      : team.name,
  }));

  const openChargeOptions = chargeRows
    .filter(
      (row) => row.charge.status !== "PAID" && row.charge.status !== "VOID",
    )
    .map((row) => ({
      value: row.charge.id,
      label: `${row.charge.team.name} · ${row.charge.title} · ${formatMoney(row.charge.amountPence)}`,
    }));

  const openChargesCount = chargeRows.filter(
    (row) => row.charge.status !== "PAID" && row.charge.status !== "VOID",
  ).length;

  const totalOutstanding = chargeRows
    .filter((row) => row.charge.status !== "PAID" && row.charge.status !== "VOID")
    .reduce((sum, row) => sum + row.summary.outstandingPence, 0);

  const needsAdminChaseCount = chargeRows.filter(
    (row) => row.needsAdminChase,
  ).length;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-white">Payments</h1>
        <p className="text-sm text-white/60">
          Create charges, record payments, and keep on top of unpaid balances.
          Fixture match fees now queue automatic post-match chases 24 hours and
          72 hours after kickoff, with anything still unpaid after that showing
          here for manual follow-up.
        </p>
      </div>

      {(sp.created || sp.error) && (
        <div className="space-y-1 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm">
          {sp.created === "charge" ? (
            <div className="text-emerald-300">Charge created.</div>
          ) : null}
          {sp.created === "payment" ? (
            <div className="text-emerald-300">Payment recorded.</div>
          ) : null}
          {sp.error === "invalid_charge" ? (
            <div className="text-red-300">Charge details are incomplete.</div>
          ) : null}
          {sp.error === "missing_team" ? (
            <div className="text-red-300">Selected team was not found.</div>
          ) : null}
          {sp.error === "invalid_payment" ? (
            <div className="text-red-300">Payment details are incomplete.</div>
          ) : null}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
            Open charges
          </div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {openChargesCount}
          </div>
        </div>

        <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-100/70">
            Outstanding
          </div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {formatMoney(totalOutstanding)}
          </div>
        </div>

        <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-red-100/70">
            Needs admin chase
          </div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {needsAdminChaseCount}
          </div>
        </div>

        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
            Recent payments
          </div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {transactions.length}
          </div>
        </div>
      </div>

      {needsAdminChaseCount > 0 ? (
        <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-5">
          <div className="text-sm font-semibold text-red-100">
            {needsAdminChaseCount} unpaid charge
            {needsAdminChaseCount === 1 ? "" : "s"} now need manual admin
            follow-up.
          </div>
          <div className="mt-1 text-sm text-red-100/75">
            These are still unpaid 72 hours after the due time, even after the
            automatic post-match chase window.
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <form
          action={createChargeAction}
          className="rounded-3xl border border-white/10 bg-white/[0.03] p-6"
        >
          <h2 className="text-xl font-semibold text-white">Create charge</h2>

          <div className="mt-4 space-y-4">
            <FormListboxField
              name="teamId"
              options={teamOptions}
              placeholder="Select team"
            />

            <input
              type="text"
              name="title"
              placeholder="Charge title"
              className="w-full rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white outline-none"
            />

            <textarea
              name="description"
              rows={4}
              placeholder="Optional description"
              className="w-full rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white outline-none"
            />

            <input
              type="number"
              step="0.01"
              min="0"
              name="amountPounds"
              placeholder="Amount in pounds"
              className="w-full rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white outline-none"
            />

            <input
              type="date"
              name="dueDate"
              className="w-full rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white outline-none"
            />

            <button
              type="submit"
              className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200"
            >
              Create charge
            </button>
          </div>
        </form>

        <form
          action={recordPaymentAction}
          className="rounded-3xl border border-white/10 bg-white/[0.03] p-6"
        >
          <h2 className="text-xl font-semibold text-white">Record payment</h2>

          <div className="mt-4 space-y-4">
            <FormListboxField
              name="teamId"
              options={teamOptions}
              placeholder="Select team"
            />

            <FormListboxField
              name="chargeId"
              value=""
              options={[
                { value: "", label: "No linked charge" },
                ...openChargeOptions,
              ]}
              placeholder="Optional linked charge"
            />

            <input
              type="number"
              step="0.01"
              min="0"
              name="amountPounds"
              placeholder="Amount in pounds"
              className="w-full rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white outline-none"
            />

            <FormListboxField
              name="method"
              value={PaymentMethod.BANK_TRANSFER}
              options={methodOptions}
              placeholder="Select payment method"
            />

            <input
              type="text"
              name="reference"
              placeholder="Reference"
              className="w-full rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white outline-none"
            />

            <textarea
              name="notes"
              rows={4}
              placeholder="Optional notes"
              className="w-full rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white outline-none"
            />

            <input
              type="datetime-local"
              name="paidAt"
              className="w-full rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white outline-none"
            />

            <button
              type="submit"
              className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200"
            >
              Record payment
            </button>
          </div>
        </form>
      </div>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-white">Charges</h2>
          <p className="text-sm text-white/55">
            Red items are still unpaid after the automatic 24-hour and 72-hour
            post-match chase window.
          </p>
        </div>

        <div className="mt-4 space-y-3">
          {chargeRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-white/55">
              No charges yet.
            </div>
          ) : (
            chargeRows.map((row) => (
              <div
                key={row.charge.id}
                className={[
                  "rounded-2xl border bg-[#0d1428] p-4",
                  row.needsAdminChase
                    ? "border-red-500/30"
                    : "border-white/10",
                ].join(" ")}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-base font-semibold text-white">
                      {row.charge.team.name} · {row.charge.title}
                    </div>
                    <div className="mt-1 text-sm text-white/55">
                      {row.charge.description || "No description"}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {row.charge.dueDate ? (
                        <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
                          Due {formatDueLabel(row.charge.dueDate)}
                        </span>
                      ) : null}

                      {row.needsAdminChase ? (
                        <span className="rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-red-200">
                          Needs admin chase
                        </span>
                      ) : row.summary.outstandingPence > 0 &&
                        row.charge.status !== "VOID" ? (
                        <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-200">
                          Awaiting payment
                        </span>
                      ) : null}

                      {row.charge.status === "PAID" ? (
                        <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">
                          Paid
                        </span>
                      ) : null}

                      {row.charge.status === "VOID" ? (
                        <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">
                          Void
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-4">
                      <Link
                        href={`/admin/teams/${row.charge.team.id}/communications`}
                        className="inline-flex items-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/15"
                      >
                        Open communications
                      </Link>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-base font-semibold text-white">
                      {formatMoney(row.charge.amountPence)}
                    </div>
                    <div className="mt-1 text-sm text-white/55">
                      Paid {formatMoney(row.summary.paidTotalPence)} · Outstanding{" "}
                      {formatMoney(row.summary.outstandingPence)}
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-[0.14em] text-white/45">
                      {row.charge.status}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="text-xl font-semibold text-white">Recent payments</h2>

        <div className="mt-4 space-y-3">
          {transactions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-white/55">
              No payments recorded yet.
            </div>
          ) : (
            transactions.map((tx) => (
              <div
                key={tx.id}
                className="rounded-2xl border border-white/10 bg-[#0d1428] p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-base font-semibold text-white">
                      {tx.team.name}
                    </div>
                    <div className="mt-1 text-sm text-white/55">
                      {tx.charge?.title ?? "Unallocated payment"}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-base font-semibold text-white">
                      {formatMoney(tx.amountPence)}
                    </div>
                    <div className="mt-1 text-sm text-white/55">
                      {formatPaymentMethodLabel(tx.method)} ·{" "}
                      {formatDateTimeLabel(tx.paidAt)}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
