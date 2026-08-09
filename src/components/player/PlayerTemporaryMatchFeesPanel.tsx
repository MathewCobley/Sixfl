import Link from "next/link";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";

type TemporaryMatchFeeRow = {
  id: string;
  amountPence: number;
  paymentUrl: string | null;
  createdAt: Date;
  teamName: string;
  kickoffAt: Date;
  homeTeamName: string;
  awayTeamName: string;
};

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function formatFixtureDate(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function PlayerTemporaryMatchFeesPanel() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();

  if (!email) return null;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!user) return null;

  const fees = await prisma.$queryRaw<TemporaryMatchFeeRow[]>`
    SELECT
      fee."id",
      fee."amountPence",
      fee."paymentUrl",
      fee."createdAt",
      team."name" AS "teamName",
      fixture."kickoffAt",
      home_team."name" AS "homeTeamName",
      away_team."name" AS "awayTeamName"
    FROM "PlayerMatchFee" fee
    INNER JOIN "Team" team ON team."id" = fee."teamId"
    INNER JOIN "Fixture" fixture ON fixture."id" = fee."fixtureId"
    INNER JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
    INNER JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
    WHERE fee."temporaryUserId" = ${user.id}
      AND fee."status" = 'OPEN'::"PlayerMatchFeeStatus"
      AND fixture."publishedAt" IS NOT NULL
    ORDER BY fixture."kickoffAt" ASC, fee."createdAt" ASC
  `;

  if (fees.length === 0) return null;

  const totalPence = fees.reduce((sum, fee) => sum + fee.amountPence, 0);

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
            These fees are attached to your SIXFL account because you played temporarily for another team. They stay visible here even though that team is not one of your regular squads.
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
                <Link
                  href={fee.paymentUrl}
                  target="_blank"
                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-300"
                >
                  Pay this fee
                </Link>
              ) : (
                <span className="text-xs text-amber-100/65">Payment link is being prepared.</span>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
