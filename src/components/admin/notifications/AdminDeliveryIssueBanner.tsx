import Link from "next/link";

import { getEmailDeliveryIssueSummary } from "@/lib/notifications/delivery-issues";

function plural(value: number, singular: string, pluralForm = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralForm}`;
}

export default async function AdminDeliveryIssueBanner() {
  const summary = await getEmailDeliveryIssueSummary();
  const hasFailures = summary.affectedRecipientCount > 0;
  const hasDelays = summary.unresolvedDelayedCount > 0;

  if (!hasFailures && !hasDelays) return null;

  const pieces = [
    hasFailures
      ? `${plural(summary.affectedRecipientCount, "recipient")} with a failed or suppressed email`
      : null,
    hasDelays
      ? `${plural(summary.unresolvedDelayedCount, "email")} temporarily delayed`
      : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <section
      className={[
        "rounded-2xl border p-4 shadow-[0_16px_50px_rgba(0,0,0,0.28)] sm:p-5",
        hasFailures
          ? "border-red-400/30 bg-red-500/[0.11]"
          : "border-amber-400/30 bg-amber-500/[0.1]",
      ].join(" ")}
      role="alert"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p
            className={[
              "text-[11px] font-black uppercase tracking-[0.2em]",
              hasFailures ? "text-red-200/80" : "text-amber-200/80",
            ].join(" ")}
          >
            Email delivery warning
          </p>
          <h2 className="mt-2 text-lg font-semibold text-white sm:text-xl">
            SIXFL has email delivery problems that need checking
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/70">
            {pieces.join(" and ")}. Bounced or suppressed addresses should be corrected before
            another message is sent; delayed mail may still arrive.
          </p>
        </div>

        <Link
          href="/admin/delivery-issues"
          className={[
            "inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl px-4 py-2.5 text-sm font-black transition",
            hasFailures
              ? "bg-red-300 text-red-950 hover:bg-red-200"
              : "bg-amber-300 text-amber-950 hover:bg-amber-200",
          ].join(" ")}
        >
          Review delivery issues
        </Link>
      </div>
    </section>
  );
}
