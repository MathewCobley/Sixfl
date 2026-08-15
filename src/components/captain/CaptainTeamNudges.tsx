import Link from "next/link";
import { Prisma } from "@prisma/client";

import { confirmFixtureFromNudgeAction } from "@/app/captain/team/[teamid]/fixtures/nudge-actions";
import CaptainFixtureConfirmButton from "@/components/captain/CaptainFixtureConfirmButton";
import CaptainPlayerPaymentLinkSummary from "@/components/captain/CaptainPlayerPaymentLinkSummary";
import { getCaptainRelatedTeamContext } from "@/lib/captain/related-teams";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { getTeamKitOrder } from "@/lib/kits/db";
import { ensurePlayerMatchPerformanceTable } from "@/lib/playerMatchPerformances";
import { prisma } from "@/lib/prisma";

type KitOfferType = "FREE_KIT" | "FOUNDING_PACKAGE" | "STANDARD";

const KIT_PACKAGE_CHANGEOVER_AT = new Date("2026-08-01T10:33:15.000Z");

async function getPendingRatingMatchCount(teamId: string) {
  await ensurePlayerMatchPerformanceTable();

  const rows = await prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS "count"
    FROM "MatchResult" result
    INNER JOIN "Fixture" fixture ON fixture."id" = result."fixtureId"
    WHERE (fixture."homeTeamId" = ${teamId} OR fixture."awayTeamId" = ${teamId})
      AND (
        NOT EXISTS (
          SELECT 1
          FROM "PlayerMatchPerformance" performance
          WHERE performance."matchResultId" = result."id"
            AND performance."teamId" = ${teamId}
            AND performance."played" = TRUE
        )
        OR EXISTS (
          SELECT 1
          FROM "PlayerMatchPerformance" performance
          WHERE performance."matchResultId" = result."id"
            AND performance."teamId" = ${teamId}
            AND performance."played" = TRUE
            AND performance."rating" IS NULL
        )
      )
  `);

  return rows[0]?.count ?? 0;
}

async function getPendingFixtureConfirmation(teamId: string) {
  const context = await getCaptainRelatedTeamContext(teamId);
  if (!context) return null;

  const fixtures = await prisma.fixture.findMany({
    where: {
      ...(context.currentLeagueId ? { leagueId: context.currentLeagueId } : {}),
      OR: [
        { homeTeamId: { in: context.relatedTeamIds } },
        { awayTeamId: { in: context.relatedTeamIds } },
      ],
      publishedAt: { not: null },
      kickoffAt: { gte: new Date() },
      status: "SCHEDULED",
      result: null,
    },
    orderBy: [{ kickoffAt: "asc" }],
    take: 10,
    select: {
      id: true,
      kickoffAt: true,
      homeTeamId: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      venue: { select: { name: true } },
      captainConfirmations: {
        where: { teamId: { in: context.relatedTeamIds } },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { status: true },
      },
    },
  });

  const awaiting = fixtures.filter((fixture) => {
    const status = fixture.captainConfirmations[0]?.status ?? null;
    return status !== "CONFIRMED" && status !== "ISSUE_RAISED";
  });
  const fixture = awaiting[0] ?? null;
  if (!fixture) return null;

  const isHome = context.relatedTeamIds.includes(fixture.homeTeamId);

  return {
    fixture,
    pendingCount: awaiting.length,
    opponent: isHome ? fixture.awayTeam.name : fixture.homeTeam.name,
  };
}

async function getKitOfferType(teamId: string): Promise<KitOfferType> {
  const rows = await prisma.$queryRaw<
    Array<{
      legacyOffer: boolean;
      wantsKitOffer: boolean;
      freeKitOfferExpired: boolean;
      hasExistingOrder: boolean;
    }>
  >(Prisma.sql`
    SELECT
      (
        EXISTS (
          SELECT 1
          FROM "InterestLead" lead
          WHERE lead."convertedTeamId" = ${teamId}
            AND lead."wantsFreeKit" = TRUE
            AND lead."createdAt" < ${KIT_PACKAGE_CHANGEOVER_AT}
        )
        OR (
          EXISTS (
            SELECT 1
            FROM "Team" legacy_team
            WHERE legacy_team."id" = ${teamId}
              AND legacy_team."wantsFreeKit" = TRUE
              AND legacy_team."createdAt" < ${KIT_PACKAGE_CHANGEOVER_AT}
          )
          AND NOT EXISTS (
            SELECT 1
            FROM "InterestLead" linked_lead
            WHERE linked_lead."convertedTeamId" = ${teamId}
              AND linked_lead."wantsFreeKit" = TRUE
          )
        )
      ) AS "legacyOffer",
      (
        EXISTS (
          SELECT 1
          FROM "InterestLead" offer_lead
          WHERE offer_lead."convertedTeamId" = ${teamId}
            AND offer_lead."wantsFreeKit" = TRUE
        )
        OR EXISTS (
          SELECT 1
          FROM "Team" offer_team
          WHERE offer_team."id" = ${teamId}
            AND offer_team."wantsFreeKit" = TRUE
        )
      ) AS "wantsKitOffer",
      EXISTS (
        SELECT 1
        FROM "Team" suppressed_team
        WHERE suppressed_team."id" = ${teamId}
          AND suppressed_team."freeKitOfferExpiredAt" IS NOT NULL
      ) AS "freeKitOfferExpired",
      EXISTS (
        SELECT 1
        FROM "TeamKitOrder" current_order
        WHERE current_order."teamId" = ${teamId}
      ) AS "hasExistingOrder"
  `);

  const row = rows[0];

  // The admin tick removes an unclaimed free-kit entitlement only. Captains can
  // still buy normal £20 kits, while any existing/current order keeps the offer
  // it was created with.
  if (row?.freeKitOfferExpired && !row.hasExistingOrder) return "STANDARD";
  if (row?.legacyOffer) return "FREE_KIT";
  if (row?.wantsKitOffer) return "FOUNDING_PACKAGE";
  return "STANDARD";
}

function getKitNudgeCopy(offerType: KitOfferType) {
  if (offerType === "FREE_KIT") {
    return {
      eyebrow: "Free team kit",
      title: "Your seven free kits are still warming the bench 👕",
      body: "Choose the design, assign the kits to your players and let them complete their own size, name and shirt number.",
      button: "Choose the free kits",
    };
  }

  if (offerType === "FOUNDING_PACKAGE") {
    return {
      eyebrow: "Team kit package",
      title: "Your team kit package is waiting 👕",
      body: "Choose the design and assign each kit to a player so they can complete their own details.",
      button: "Open the kit order",
    };
  }

  return {
    eyebrow: "Team kits",
    title: "Fancy looking like a proper team? 👕",
    body: "Complete kits are £20 each. Select every player who wants one and send each of them their own payment link.",
    button: "Send kit payment links",
  };
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

function getConfirmationUrgency(kickoffAt: Date) {
  const hoursToKickoff = Math.floor(
    (kickoffAt.getTime() - Date.now()) / (1000 * 60 * 60),
  );

  if (hoursToKickoff <= 24) {
    return {
      eyebrow: "Urgent next action",
      badge: "Confirmation overdue",
      title: "Confirm your fixture now",
      copy: "Kick-off is close, so SIXFL needs your answer urgently.",
      classes:
        "border-red-400/30 bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.2),transparent_42%),rgba(239,68,68,0.09)]",
      badgeClasses: "border-red-300/30 bg-red-400/15 text-red-50",
      buttonClasses: "bg-red-300 hover:bg-red-200",
      eyebrowClasses: "text-red-100/75",
    };
  }

  return {
    eyebrow: "Your most important next action",
    badge: "Awaiting confirmation",
    title: "Please confirm your next fixture",
    copy: "Let SIXFL know whether your team can play, or raise an issue early if you need help.",
    classes:
      "border-amber-400/30 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_42%),rgba(245,158,11,0.08)]",
    badgeClasses: "border-amber-300/30 bg-amber-400/15 text-amber-50",
    buttonClasses: "bg-amber-300 hover:bg-amber-200",
    eyebrowClasses: "text-amber-100/75",
  };
}

export default async function CaptainTeamNudges({ teamId }: { teamId: string }) {
  const [pendingFixture, pendingRatingMatchCount, offerType, kitOrder] =
    await Promise.all([
      getPendingFixtureConfirmation(teamId),
      getPendingRatingMatchCount(teamId),
      getKitOfferType(teamId),
      getTeamKitOrder(teamId),
    ]);

  const showRatingsNudge = pendingRatingMatchCount > 0;
  const showKitNudge = !kitOrder || kitOrder.status === "DRAFT";

  const kitCopy = getKitNudgeCopy(offerType);
  const confirmationCopy = pendingFixture
    ? getConfirmationUrgency(pendingFixture.fixture.kickoffAt)
    : null;

  return (
    <div className="space-y-4">
      {pendingFixture && confirmationCopy ? (
        <section
          className={`overflow-hidden rounded-3xl border p-5 shadow-[0_22px_75px_rgba(0,0,0,0.28)] sm:p-6 ${confirmationCopy.classes}`}
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p
                  className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${confirmationCopy.eyebrowClasses}`}
                >
                  {confirmationCopy.eyebrow}
                </p>
                <span
                  className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${confirmationCopy.badgeClasses}`}
                >
                  {confirmationCopy.badge}
                </span>
              </div>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">
                {confirmationCopy.title}
              </h2>
              <p className="mt-3 max-w-4xl text-sm leading-6 text-white/78 sm:text-base">
                <span className="font-semibold text-white">
                  {formatFixtureDate(pendingFixture.fixture.kickoffAt)} vs {pendingFixture.opponent}
                </span>
                {pendingFixture.fixture.venue?.name
                  ? ` · ${pendingFixture.fixture.venue.name}`
                  : ""}
                . {confirmationCopy.copy}
              </p>
              {pendingFixture.pendingCount > 1 ? (
                <p className="mt-2 text-xs font-semibold text-white/55">
                  {pendingFixture.pendingCount} upcoming fixtures are waiting for confirmation.
                </p>
              ) : null}
            </div>
            <form action={confirmFixtureFromNudgeAction} className="shrink-0">
              <input type="hidden" name="teamId" value={teamId} />
              <input
                type="hidden"
                name="fixtureId"
                value={pendingFixture.fixture.id}
              />
              <CaptainFixtureConfirmButton
                className={`inline-flex min-h-14 items-center justify-center rounded-2xl px-6 py-3 text-base font-black text-black shadow-[0_12px_35px_rgba(0,0,0,0.22)] transition ${confirmationCopy.buttonClasses}`}
              />
            </form>
          </div>
        </section>
      ) : null}

      <CaptainPlayerPaymentLinkSummary teamId={teamId} />

      {showRatingsNudge || showKitNudge ? (
        <section className="overflow-hidden rounded-3xl border border-rose-400/20 bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.13),transparent_38%),rgba(255,255,255,0.04)] shadow-[0_18px_65px_rgba(0,0,0,0.22)]">
          {showRatingsNudge ? (
            <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-200/75">
                  Your players are waiting
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Do you not love your team? ❤️
                </h2>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-rose-50/75">
                  You have not rated them yet. {pendingRatingMatchCount} completed match
                  {pendingRatingMatchCount === 1 ? " still needs" : "es still need"} player ratings.
                  Their stats currently say “Not rated”, and dressing-room bragging rights are on hold.
                </p>
              </div>
              <Link
                href={`/captain/team/${teamId}/results?needsCompletion=1`}
                className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-2xl bg-rose-300 px-5 py-3 text-sm font-black text-black transition hover:bg-rose-200"
              >
                Rate your players
              </Link>
            </div>
          ) : null}

          {showKitNudge ? (
            <div
              className={[
                "flex flex-col gap-4 border-white/10 bg-black/15 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between",
                showRatingsNudge ? "border-t" : "",
              ].join(" ")}
            >
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-200/70">
                  {kitCopy.eyebrow}
                </p>
                <h3 className="mt-2 text-xl font-semibold text-white">{kitCopy.title}</h3>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-white/65">{kitCopy.body}</p>
              </div>
              <Link
                href={`/captain/team/${teamId}/kit`}
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-2xl border border-sky-300/25 bg-sky-400/10 px-5 py-3 text-sm font-semibold text-sky-50 transition hover:bg-sky-400/15"
              >
                {kitCopy.button}
              </Link>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
