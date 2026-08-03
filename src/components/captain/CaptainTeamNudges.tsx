import Link from "next/link";
import { Prisma } from "@prisma/client";

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

async function getKitOfferType(teamId: string): Promise<KitOfferType> {
  const rows = await prisma.$queryRaw<
    Array<{ legacyOffer: boolean; wantsKitOffer: boolean }>
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
      ) AS "wantsKitOffer"
  `);

  if (rows[0]?.legacyOffer) return "FREE_KIT";
  if (rows[0]?.wantsKitOffer) return "FOUNDING_PACKAGE";
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

export default async function CaptainTeamNudges({ teamId }: { teamId: string }) {
  const [pendingRatingMatchCount, offerType, kitOrder] = await Promise.all([
    getPendingRatingMatchCount(teamId),
    getKitOfferType(teamId),
    getTeamKitOrder(teamId),
  ]);

  const showRatingsNudge = pendingRatingMatchCount > 0;
  const showKitNudge = !kitOrder || kitOrder.status === "DRAFT";

  if (!showRatingsNudge && !showKitNudge) return null;

  const kitCopy = getKitNudgeCopy(offerType);

  return (
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
  );
}
