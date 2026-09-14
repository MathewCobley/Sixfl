import Link from "next/link";

import {
  getChargeOutstandingPence,
  getChargePaidTotal,
} from "@/lib/payments/charge-status";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { voidExtraKitPaymentLinkAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Extra Kit Payment Links | SIXFL Admin",
};

const EXTRA_KIT_TITLE_PREFIX = "Additional kit contribution •";

type SearchParams = {
  notice?: string | string[];
  error?: string | string[];
};

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] ?? "" : input ?? "";
}

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(date);
}

function errorMessage(code: string) {
  switch (code) {
    case "invalid":
      return "That extra-kit payment request could not be found.";
    case "not_open":
      return "Only an unpaid open payment link can be voided.";
    case "already_paid":
      return "Stripe reports that checkout as paid, so it was not voided.";
    case "save_failed":
      return "The payment link could not be voided. Nothing was removed.";
    default:
      return null;
  }
}

export default async function ExtraKitPaymentLinksPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();
  const sp = (await searchParams) ?? {};

  const charges = await prisma.paymentCharge.findMany({
    where: {
      title: { startsWith: EXTRA_KIT_TITLE_PREFIX },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      teamId: true,
      title: true,
      description: true,
      amountPence: true,
      status: true,
      paymentToken: true,
      createdAt: true,
      lastStripeCheckoutSessionId: true,
      team: { select: { name: true } },
      transactions: { select: { amountPence: true } },
    },
  });

  const rows = charges.map((charge) => {
    const paidPence = getChargePaidTotal(charge.transactions);
    const outstandingPence = getChargeOutstandingPence(
      charge.amountPence,
      paidPence,
    );
    const displayStatus =
      charge.status === "VOID"
        ? "VOID"
        : outstandingPence <= 0 || charge.status === "PAID"
          ? "PAID"
          : charge.status;

    return {
      ...charge,
      payerName: charge.title.slice(EXTRA_KIT_TITLE_PREFIX.length).trim(),
      paidPence,
      outstandingPence,
      displayStatus,
      canVoid: charge.status === "OPEN" && paidPence === 0,
    };
  });

  const notice = value(sp.notice) === "voided";
  const error = errorMessage(value(sp.error));

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-emerald-400/20 bg-white/[0.035] p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/80">
              Admin only
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
              Extra-kit payment links
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
              Review additional-kit payment requests and void an unpaid link when it was created in error. Voiding preserves the payment record for audit history.
            </p>
          </div>
          <Link
            href="/admin/kits"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-semibold text-white/70 transition hover:bg-white/[0.08]"
          >
            Back to kits
          </Link>
        </div>
      </section>

      {notice ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          Payment link voided. The SIXFL link can no longer start a Stripe checkout.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-white/45">
            No extra-kit payment requests have been created yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-black/25 text-white/40">
                <tr>
                  <th className="px-4 py-3 font-semibold">Team / payer</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Paid</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {rows.map((row) => (
                  <tr key={row.id} className="align-top text-white/65">
                    <td className="px-4 py-4">
                      <div className="font-semibold text-white">{row.team.name}</div>
                      <div className="mt-1 text-xs text-white/45">{row.payerName || "Team member"}</div>
                      {row.description ? (
                        <div className="mt-1 max-w-md text-xs leading-5 text-white/30">
                          {row.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-xs text-white/45">
                      {formatDate(row.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 font-semibold text-white">
                      {formatMoney(row.amountPence)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      {formatMoney(row.paidPence)}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={[
                          "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                          row.displayStatus === "PAID"
                            ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
                            : row.displayStatus === "VOID"
                              ? "border-white/10 bg-white/[0.04] text-white/45"
                              : "border-amber-400/20 bg-amber-500/10 text-amber-100",
                        ].join(" ")}
                      >
                        {row.displayStatus}
                      </span>
                      {row.lastStripeCheckoutSessionId && row.displayStatus !== "VOID" ? (
                        <div className="mt-2 text-[10px] text-white/30">Stripe checkout created</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      {row.canVoid ? (
                        <form action={voidExtraKitPaymentLinkAction}>
                          <input type="hidden" name="chargeId" value={row.id} />
                          <button
                            type="submit"
                            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-red-400/25 bg-red-500/10 px-3 text-xs font-semibold text-red-100 transition hover:bg-red-500/20"
                          >
                            Void payment link
                          </button>
                        </form>
                      ) : row.displayStatus === "PAID" ? (
                        <span className="text-xs text-white/35">Paid — protected</span>
                      ) : row.displayStatus === "VOID" ? (
                        <span className="text-xs text-white/35">Already void</span>
                      ) : (
                        <span className="text-xs text-white/35">Cannot void after payment starts</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
