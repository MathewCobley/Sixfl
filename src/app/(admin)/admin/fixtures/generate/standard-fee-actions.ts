// ========================================
// File: src/app/(admin)/admin/fixtures/generate/standard-fee-actions.ts
// ========================================

"use server";

import { FixtureStatus, PaymentChargeStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  queueFixtureMatchFeeEmails,
  syncFixtureMatchFeeCharges,
} from "@/lib/payments/fixture-match-fees";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type TeamStandardFeeRow = {
  id: string;
  standardMatchFeePence: number | null;
};

function parseRequiredString(value: FormDataEntryValue | null, fieldName: string) {
  const parsed = String(value ?? "").trim();
  if (!parsed) throw new Error(`${fieldName} is required.`);
  return parsed;
}

function getStandardFeeForTeam(
  feeMap: Map<string, number | null>,
  teamId: string,
) {
  const value = feeMap.get(teamId);
  return typeof value === "number" && value > 0 ? value : null;
}

function getFixtureDisplayFee(homeFee: number | null, awayFee: number | null) {
  const highestFee = Math.max(homeFee ?? 0, awayFee ?? 0);
  return highestFee > 0 ? highestFee : null;
}

function revalidateFixtureFeePaths(leagueId: string, leagueSlug: string | null) {
  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/fixtures/generate");
  revalidatePath("/admin/payments");
  revalidatePath(`/admin/leagues/${leagueId}`);
  revalidatePath(`/admin/leagues/${leagueId}/fixtures`);

  if (leagueSlug) {
    revalidatePath(`/leagues/${leagueSlug}`);
    revalidatePath(`/leagues/${leagueSlug}/fixtures`);
  }
}

export async function backfillStandardFixtureFeesAction(formData: FormData) {
  await requireAdmin();

  const leagueId = parseRequiredString(formData.get("leagueId"), "League");
  const sendPaymentRequests = String(formData.get("sendPaymentRequests") || "") === "on";

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true, name: true, season: true, slug: true },
  });

  if (!league) {
    throw new Error("League not found.");
  }

  const fixtures = await prisma.fixture.findMany({
    where: {
      leagueId,
      status: FixtureStatus.SCHEDULED,
      kickoffAt: { gte: new Date() },
    },
    orderBy: [{ kickoffAt: "asc" }, { position: "asc" }],
    include: {
      homeTeam: { select: { id: true, name: true, logoUrl: true } },
      awayTeam: { select: { id: true, name: true, logoUrl: true } },
      paymentCharges: {
        where: { status: { not: PaymentChargeStatus.VOID } },
        select: { id: true },
      },
    },
  });

  if (fixtures.length === 0) {
    revalidateFixtureFeePaths(league.id, league.slug);
    redirect("/admin/fixtures/generate?standardFees=0&standardFeeCharges=0&paymentRequests=0");
  }

  const teamIds = Array.from(
    new Set(fixtures.flatMap((fixture) => [fixture.homeTeamId, fixture.awayTeamId])),
  );

  const feeRows = teamIds.length
    ? await prisma.$queryRaw<TeamStandardFeeRow[]>(Prisma.sql`
        SELECT "id", "standardMatchFeePence"
        FROM "Team"
        WHERE "id" IN (${Prisma.join(teamIds)})
      `)
    : [];

  const feeMap = new Map(
    feeRows.map((row) => [row.id, row.standardMatchFeePence ?? null]),
  );

  const createdChargeGroups: Array<{
    fixtureId: string;
    kickoffAt: Date;
    homeTeam: { id: string; name: string; logoUrl: string | null };
    awayTeam: { id: string; name: string; logoUrl: string | null };
    homeFee: number | null;
    awayFee: number | null;
    charges: Array<{
      id: string;
      teamId: string;
      teamName: string;
      teamLogoUrl: string | null;
      paymentToken: string | null;
      amountPence: number;
    }>;
  }> = [];

  let fixturesGivenStandardFee = 0;
  let publishedFixturesWithCharges = 0;

  await prisma.$transaction(async (tx) => {
    for (const fixture of fixtures) {
      const homeFee = getStandardFeeForTeam(feeMap, fixture.homeTeamId);
      const awayFee = getStandardFeeForTeam(feeMap, fixture.awayTeamId);
      const displayFee = getFixtureDisplayFee(homeFee, awayFee);

      if (displayFee && fixture.matchFeePence !== displayFee) {
        await tx.fixture.update({
          where: { id: fixture.id },
          data: { matchFeePence: displayFee },
        });
        fixturesGivenStandardFee += 1;
      }

      if (!fixture.publishedAt || fixture.paymentCharges.length > 0) {
        continue;
      }

      const result = await syncFixtureMatchFeeCharges({
        db: tx,
        fixtureId: fixture.id,
        leagueId,
        leagueName: league.name,
        leagueSeason: league.season,
        kickoffAt: fixture.kickoffAt,
        homeTeam: fixture.homeTeam,
        awayTeam: fixture.awayTeam,
        homeMatchFeePence: homeFee,
        awayMatchFeePence: awayFee,
      });

      if (result.activeCharges.length > 0) {
        publishedFixturesWithCharges += 1;
        createdChargeGroups.push({
          fixtureId: fixture.id,
          kickoffAt: fixture.kickoffAt,
          homeTeam: fixture.homeTeam,
          awayTeam: fixture.awayTeam,
          homeFee,
          awayFee,
          charges: result.activeCharges,
        });
      }
    }
  });

  let queuedPaymentMessages = 0;

  if (sendPaymentRequests) {
    for (const group of createdChargeGroups) {
      const result = await queueFixtureMatchFeeEmails({
        fixtureId: group.fixtureId,
        leagueId,
        leagueName: league.name,
        leagueSeason: league.season,
        kickoffAt: group.kickoffAt,
        homeTeam: group.homeTeam,
        awayTeam: group.awayTeam,
        homeMatchFeePence: group.homeFee,
        awayMatchFeePence: group.awayFee,
        charges: group.charges,
      });

      queuedPaymentMessages += result.queued;
    }
  }

  revalidateFixtureFeePaths(league.id, league.slug);

  redirect(
    `/admin/fixtures/generate?standardFees=${fixturesGivenStandardFee}&standardFeeCharges=${publishedFixturesWithCharges}&paymentRequests=${queuedPaymentMessages}`,
  );
}
