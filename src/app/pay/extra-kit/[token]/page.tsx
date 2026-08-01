import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getChargeOutstandingPence,
  getChargePaidTotal,
} from "@/lib/payments/charge-status";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const EXTRA_KIT_TITLE_PREFIX = "Additional kit contribution •";

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

export default async function ExtraKitPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ payment?: string }>;
}) {
  const { token } = await params;
  const sp = (await searchParams) ?? {};

  const charge = await prisma.paymentCharge.findUnique({
    where: { paymentToken: token },
    select: {
      id: true,
      title: true,
      description: true,
      amountPence: true,
      status: true,
      paymentToken: true,
      team: { select: { name: true } },
      transactions: { select: { amountPence: true } },
    },
  });

  if (!charge || !charge.title.startsWith(EXTRA_KIT_TITLE_PREFIX)) {
    notFound();
  }

  const paidPence = getChargePaidTotal(charge.transactions);
  const outstandingPence = getChargeOutstandingPence(
    charge.amountPence,
    paidPence,
  );
  const canPay =
    charge.status !== "VOID" &&
    outstandingPence > 0 &&
    Boolean(charge.paymentToken);
  const payerName = charge.title.slice(EXTRA_KIT_TITLE_PREFIX.length).trim();

  return (
    <div className="min-h-screen bg-[#07130f] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            Secure SIXFL payment
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Additional team kit payment
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-white/60">
            Pay your share of {charge.team.name}&apos;s additional kit order.
          </p>
        </header>

        {sp.payment === "success" ? (
          <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            Payment received. Thank you.
          </div>
        ) : sp.payment === "cancelled" ? (
          <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-100">
            Payment was cancelled. No money was taken.
          </div>
        ) : null}

        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_230px]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Payment request
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                {payerName || "Additional kit contribution"}
              </h2>
              <p className="mt-3 text-sm leading-6 text-white/60">
                {charge.description || "Additional complete SIXFL team kits at £20 each."}
              </p>
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/65">
                Team: <span className="font-semibold text-white">{charge.team.name}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-5 lg:text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
                Amount to pay
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">
                {formatMoney(outstandingPence)}
              </p>
              <p className="mt-2 text-sm text-emerald-100/70">
                {paidPence > 0
                  ? `${formatMoney(paidPence)} already paid`
                  : "Secure payment through Stripe"}
              </p>
            </div>
          </div>

          <div className="mt-7 border-t border-white/10 pt-6">
            {canPay ? (
              <form action={`/pay/extra-kit/${token}/start`} method="post">
                <button
                  type="submit"
                  className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 py-3 text-sm font-semibold text-black transition hover:bg-emerald-300"
                >
                  Continue to secure payment
                </button>
              </form>
            ) : charge.status === "VOID" ? (
              <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                This payment request has been cancelled.
              </div>
            ) : (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                This payment request has been paid in full.
              </div>
            )}
          </div>
        </section>

        <div className="text-center">
          <Link href="/" className="text-sm font-medium text-white/55 hover:text-white/80">
            Back to SIXFL
          </Link>
        </div>
      </div>
    </div>
  );
}
