// ========================================
// File: src/app/(admin)/admin/payments/explain/page.tsx
// ========================================

import Link from "next/link";
import { Prisma } from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Payment explanations | SIXFL" };

type SearchParams = {
  q?: string;
};

type PaymentExplainRow = {
  id: string;
  amountPence: number;
  method: string;
  reference: string | null;
  notes: string | null;
  paidAt: Date;
  teamId: string;
  teamName: string;
  chargeId: string | null;
  chargeTitle: string | null;
  chargeDescription: string | null;
  fixtureId: string | null;
  fixtureKickoffAt: Date | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  leagueName: string | null;
  leagueSeason: string | null;
  playerFeeId: string | null;
  teamMemberName: string | null;
  teamMemberEmail: string | null;
  prospectFirstName: string | null;
  prospectLastName: string | null;
  prospectEmail: string | null;
  prospectPhone: string | null;
};

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function formatDateTime(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalise(value: string | null | undefined) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function getPlayerName(row: PaymentExplainRow) {
  const prospectName = [row.prospectFirstName, row.prospectLastName].filter(Boolean).join(" ").trim();
  return row.teamMemberName || row.teamMemberEmail || prospectName || row.prospectEmail || row.prospectPhone || null;
}

function getPlayerContact(row: PaymentExplainRow) {
  return row.teamMemberEmail || [row.prospectEmail, row.prospectPhone].filter(Boolean).join(" · ") || null;
}

function getFixtureLabel(row: PaymentExplainRow) {
  if (!row.homeTeamName || !row.awayTeamName) return null;
  return `${row.homeTeamName} vs ${row.awayTeamName}`;
}

function getPaymentType(row: PaymentExplainRow) {
  const notes = normalise(row.notes);

  if (row.playerFeeId || notes.includes("player match fee") || notes.includes("player fee id:")) {
    return {
      label: "Player / squad payment",
      tone: "border-sky-400/25 bg-sky-500/10 text-sky-100",
      explanation: "An individual player used a squad payment link.",
    };
  }

  if (notes.includes("recurring team subscription")) {
    return {
      label: "Recurring team payment",
      tone: "border-fuchsia-400/25 bg-fuchsia-500/10 text-fuchsia-100",
      explanation: row.chargeId
        ? "A recurring Stripe payment was applied to a team charge."
        : "A recurring Stripe payment was recorded, but it was not linked to a specific fixture charge.",
    };
  }

  if (row.chargeId && row.fixtureId) {
    return {
      label: "Team fixture payment",
      tone: "border-emerald-400/25 bg-emerald-500/10 text-emerald-100",
      explanation: "A team paid against a fixture match-fee charge.",
    };
  }

  if (row.chargeId) {
    return {
      label: "Team charge payment",
      tone: "border-emerald-400/25 bg-emerald-500/10 text-emerald-100",
      explanation: "A team paid against a non-fixture charge.",
    };
  }

  return {
    label: "Unlinked payment",
    tone: "border-amber-400/25 bg-amber-500/10 text-amber-100",
    explanation: "The money is recorded, but it is not linked to a charge or player fee. Check the reference/notes.",
  };
}

function paymentMatchesQuery(row: PaymentExplainRow, query: string) {
  if (!query) return true;

  const values = [
    row.teamName,
    row.chargeTitle,
    row.chargeDescription,
    row.notes,
    row.reference,
    row.method,
    row.leagueName,
    row.leagueSeason,
    getFixtureLabel(row),
    getPlayerName(row),
    getPlayerContact(row),
    formatMoney(row.amountPence),
    formatDateTime(row.paidAt),
  ];

  return values.some((value) => normalise(value).includes(query));
}

export default async function PaymentExplanationsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};
  const searchQuery = String(sp.q ?? "").trim();
  const normalisedQuery = normalise(searchQuery);

  const rows = await prisma.$queryRaw<PaymentExplainRow[]>(Prisma.sql`
    SELECT
      tx."id",
      tx."amountPence"::int AS "amountPence",
      tx."method"::text AS "method",
      tx."reference",
      tx."notes",
      tx."paidAt",
      tx."teamId",
      team."name" AS "teamName",
      charge."id" AS "chargeId",
      charge."title" AS "chargeTitle",
      charge."description" AS "chargeDescription",
      fixture."id" AS "fixtureId",
      fixture."kickoffAt" AS "fixtureKickoffAt",
      home."name" AS "homeTeamName",
      away."name" AS "awayTeamName",
      league."name" AS "leagueName",
      league."season" AS "leagueSeason",
      fee."id" AS "playerFeeId",
      playerUser."name" AS "teamMemberName",
      playerUser."email" AS "teamMemberEmail",
      prospect."firstName" AS "prospectFirstName",
      prospect."lastName" AS "prospectLastName",
      prospect."email" AS "prospectEmail",
      prospect."phone" AS "prospectPhone"
    FROM "PaymentTransaction" tx
    JOIN "Team" team ON team."id" = tx."teamId"
    LEFT JOIN "PaymentCharge" charge ON charge."id" = tx."chargeId"
    LEFT JOIN "Fixture" fixture ON fixture."id" = charge."fixtureId"
    LEFT JOIN "Team" home ON home."id" = fixture."homeTeamId"
    LEFT JOIN "Team" away ON away."id" = fixture."awayTeamId"
    LEFT JOIN "League" league ON league."id" = COALESCE(charge."leagueId", team."leagueId")
    LEFT JOIN "PlayerMatchFee" fee ON tx."notes" ILIKE '%' || fee."id" || '%'
    LEFT JOIN "TeamMember" member ON member."id" = fee."teamMemberId"
    LEFT JOIN "User" playerUser ON playerUser."id" = member."userId"
    LEFT JOIN "TeamPlayerProspect" prospect ON prospect."id" = fee."prospectId"
    ORDER BY tx."paidAt" DESC
    LIMIT 200
  `);

  const filteredRows = rows.filter((row) => paymentMatchesQuery(row, normalisedQuery));
  const visibleRows = filteredRows.slice(0, 80);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-6">
      <section className="rounded-3xl border border-sky-400/20 bg-sky-500/10 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-100/70">Payment audit</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">What are these payments?</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-sky-50/75">
              This view explains each Stripe/manual payment by linking it back to a team charge, fixture, recurring team subscription or individual player fee where possible.
            </p>
          </div>
          <Link href="/admin/payments" className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-black/25 px-4 text-sm font-semibold text-white/75 transition hover:bg-black/35">
            Back to payments
          </Link>
        </div>

        <form method="get" className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input
            type="search"
            name="q"
            defaultValue={searchQuery}
            placeholder="Search team, player, email, fixture, reference..."
            className="h-12 flex-1 rounded-2xl border border-white/10 bg-black/35 px-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-sky-300/50"
          />
          <button type="submit" className="inline-flex h-12 items-center justify-center rounded-2xl bg-sky-300 px-5 text-sm font-semibold text-black transition hover:bg-sky-200">
            Search
          </button>
        </form>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Explained payments</h2>
            <p className="mt-2 text-sm text-white/55">Showing {visibleRows.length} of {filteredRows.length} matching payments.</p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {visibleRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-white/55">
              No payments match this search.
            </div>
          ) : null}

          {visibleRows.map((row) => {
            const type = getPaymentType(row);
            const playerName = getPlayerName(row);
            const playerContact = getPlayerContact(row);
            const fixtureLabel = getFixtureLabel(row);
            const leagueLabel = [row.leagueName, row.leagueSeason].filter(Boolean).join(" · ");

            return (
              <article key={row.id} className="rounded-2xl border border-white/10 bg-[#0d1428] p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${type.tone}`}>
                        {type.label}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">
                        {row.method.replaceAll("_", " ")}
                      </span>
                    </div>

                    <h3 className="mt-3 text-lg font-semibold text-white">{row.teamName}</h3>
                    <p className="mt-1 text-sm text-white/65">{type.explanation}</p>

                    <div className="mt-3 grid gap-2 text-sm text-white/60 md:grid-cols-2">
                      {row.chargeTitle ? <div><span className="text-white/35">Charge:</span> {row.chargeTitle}</div> : null}
                      {row.chargeDescription ? <div><span className="text-white/35">Charge note:</span> {row.chargeDescription}</div> : null}
                      {fixtureLabel ? <div><span className="text-white/35">Fixture:</span> {fixtureLabel}</div> : null}
                      {row.fixtureKickoffAt ? <div><span className="text-white/35">Fixture date:</span> {formatDateTime(row.fixtureKickoffAt)}</div> : null}
                      {playerName ? <div><span className="text-white/35">Player:</span> {playerName}</div> : null}
                      {playerContact && playerContact !== playerName ? <div><span className="text-white/35">Player contact:</span> {playerContact}</div> : null}
                      {leagueLabel ? <div><span className="text-white/35">League:</span> {leagueLabel}</div> : null}
                      {row.reference ? <div><span className="text-white/35">Reference:</span> {row.reference}</div> : null}
                    </div>

                    {row.notes ? (
                      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-white/55">
                        <span className="font-semibold text-white/70">Notes:</span> {row.notes}
                      </div>
                    ) : null}
                  </div>

                  <div className="shrink-0 text-left text-sm text-white/60 lg:text-right">
                    <div className="text-xl font-semibold text-white">{formatMoney(row.amountPence)}</div>
                    <div className="mt-1">{formatDateTime(row.paidAt)}</div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
