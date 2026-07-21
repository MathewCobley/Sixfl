// ========================================
// File: src/app/(admin)/admin/payments/void/[chargeId]/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";

import AdminVoidChargeButton from "@/components/admin/payments/AdminVoidChargeButton";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ chargeId: string }>;
};

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function formatStatus(status: string) {
  return status.replaceAll("_", " ");
}

export default async function VoidPaymentChargePage({ params }: PageProps) {
  await requireAdmin();

  const { chargeId } = await params;
  const id = chargeId.trim();
  if (!id) notFound();

  const charge = await prisma.paymentCharge.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      amountPence: true,
      status: true,
      dueDate: true,
      team: {
        select: {
          id: true,
          name: true,
        },
      },
      transactions: {
        select: {
          id: true,
          amountPence: true,
        },
      },
    },
  });

  if (!charge) notFound();

  const paidTotalPence = charge.transactions.reduce(
    (total, transaction) => total + transaction.amountPence,
    0,
  );
  const alreadyVoid = charge.status === "VOID";
  const hasRecordedPayment =
    charge.status === "PAID" ||
    charge.status === "PART_PAID" ||
    paidTotalPence > 0;
  const canVoid = !alreadyVoid && !hasRecordedPayment;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <Link
          href="/admin/payments?view=teamCharges"
          className="text-sm font-medium text-emerald-300 transition hover:text-emerald-200"
        >
          ← Back to payments
        </Link>
      </div>

      <section className="overflow-hidden rounded-3xl border border-red-400/20 bg-white/[0.04] shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
        <div className="border-b border-white/10 bg-red-500/[0.06] px-6 py-6 sm:px-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-red-200/70">
            Payment administration
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
            Void team charge
          </h1>
          <p className="mt-2 text-sm leading-6 text-white/60">
            Review the charge carefully. Voiding removes it from the outstanding team balance and cancels queued payment reminders.
          </p>
        </div>

        <div className="space-y-5 px-6 py-6 sm:px-8">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-[0.14em] text-white/40">Team</div>
              <div className="mt-2 font-semibold text-white">{charge.team.name}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-[0.14em] text-white/40">Amount</div>
              <div className="mt-2 font-semibold text-white">{formatMoney(charge.amountPence)}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 sm:col-span-2">
              <div className="text-xs uppercase tracking-[0.14em] text-white/40">Charge</div>
              <div className="mt-2 font-semibold text-white">{charge.title}</div>
              {charge.description ? (
                <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/55">
                  {charge.description}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-semibold uppercase tracking-[0.12em] text-white/60">
              Status {formatStatus(charge.status)}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-semibold uppercase tracking-[0.12em] text-white/60">
              Recorded payments {formatMoney(paidTotalPence)}
            </span>
          </div>

          {alreadyVoid ? (
            <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-5 py-4 text-sm leading-6 text-emerald-100">
              This charge has already been voided. No further action is required.
            </div>
          ) : null}

          {hasRecordedPayment ? (
            <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 px-5 py-4 text-sm leading-6 text-amber-100">
              This charge is paid or part-paid and cannot be voided. Review the recorded payment or refund it before changing the charge.
            </div>
          ) : null}

          {canVoid ? (
            <div className="rounded-2xl border border-red-400/25 bg-red-500/10 p-5">
              <p className="text-sm font-semibold text-red-50">
                This action cannot be undone from this screen.
              </p>
              <p className="mt-2 text-sm leading-6 text-red-100/75">
                The charge will be marked VOID and any queued match-fee emails or reminders linked to it will be cancelled.
              </p>
              <div className="mt-5">
                <AdminVoidChargeButton chargeId={charge.id} />
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
