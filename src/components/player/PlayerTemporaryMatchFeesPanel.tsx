"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type TemporaryMatchFee = {
  id: string;
  amountPence: number;
  paymentUrl: string | null;
  createdAt: string;
  teamName: string;
  kickoffAt: string;
  homeTeamName: string;
  awayTeamName: string;
};

type ResponsePayload = {
  fees: TemporaryMatchFee[];
};

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function formatFixtureDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

export default function PlayerTemporaryMatchFeesPanel({ teamId }: { teamId: string }) {
  const searchParams = useSearchParams();
  const previewMembershipId = searchParams.get("previewMembershipId")?.trim() ?? "";
  const [fees, setFees] = useState<TemporaryMatchFee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      try {
        const query = new URLSearchParams({ teamId });
        if (previewMembershipId) query.set("previewMembershipId", previewMembershipId);

        const response = await fetch(`/api/player/temporary-match-fees?${query.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as ResponsePayload | null;
        if (!controller.signal.aborted) {
          setFees(response.ok && payload?.fees ? payload.fees : []);
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setFees([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [previewMembershipId, teamId]);

  const totalPence = useMemo(
    () => fees.reduce((sum, fee) => sum + fee.amountPence, 0),
    [fees],
  );

  if (loading || fees.length === 0) return null;

  return (
    <section className="mt-4 rounded-3xl border border-amber-400/30 bg-amber-500/[0.09] p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">
            Other team match fees
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            {formatMoney(totalPence)} due from temporary appearances
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-50/70">
            These are fixture-only fees from teams you played for temporarily. They remain attached to your SIXFL account even though those teams are not part of your regular squad.
          </p>
        </div>
        <span className="inline-flex shrink-0 rounded-full border border-amber-300/25 bg-black/20 px-3 py-1.5 text-xs font-semibold text-amber-100">
          {fees.length} fee{fees.length === 1 ? "" : "s"} due
        </span>
      </div>

      <div className="mt-5 space-y-3">
        {fees.map((fee) => (
          <article key={fee.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-100">
                    Temporary player · {fee.teamName}
                  </span>
                  <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-100">
                    {formatMoney(fee.amountPence)} due
                  </span>
                </div>
                <h3 className="mt-3 text-sm font-semibold text-white">
                  {fee.homeTeamName} vs {fee.awayTeamName}
                </h3>
                <p className="mt-1 text-xs text-white/50">
                  {formatFixtureDate(fee.kickoffAt)} · requested {formatFixtureDate(fee.createdAt)}
                </p>
              </div>

              {fee.paymentUrl ? (
                <a
                  href={fee.paymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-300"
                >
                  Pay this fee
                </a>
              ) : (
                <span className="text-xs text-amber-100/65">Payment link could not be prepared.</span>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
