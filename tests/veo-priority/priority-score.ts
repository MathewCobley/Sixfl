import assert from "node:assert/strict";

import { prisma } from "../../src/lib/prisma";
import { getPriorityDeductionDetails } from "../../src/lib/sixfl-tv/priority-deductions";
import { getSixflTvPriorityScores, getSixflTvPriorityScore } from "../../src/lib/sixfl-tv/priority-score";

const prefix = "priority_score_test";

function id(value: string) {
  return `${prefix}_${value}`;
}

async function cleanup() {
  await prisma.$executeRawUnsafe(`
    DELETE FROM "PaymentTransaction" WHERE "teamId" IN ('${id("team")}','${id("opponent")}')
  `);
  await prisma.$executeRawUnsafe(`
    DELETE FROM "PaymentCharge" WHERE "teamId" IN ('${id("team")}','${id("opponent")}')
  `);
  await prisma.$executeRawUnsafe(`
    DELETE FROM "PlayerMatchPerformance" WHERE "teamId" IN ('${id("team")}','${id("opponent")}')
  `);
  await prisma.fixtureCaptainConfirmation.deleteMany({
    where: { teamId: { in: [id("team"), id("opponent"), id("new")] } },
  });
  await prisma.matchResultTeamMeta.deleteMany({
    where: { teamId: { in: [id("team"), id("opponent"), id("new")] } },
  });
  await prisma.matchResult.deleteMany({
    where: { fixtureId: { startsWith: id("fixture_") } },
  });
  await prisma.fixture.deleteMany({
    where: { id: { startsWith: id("fixture_") } },
  });
  await prisma.teamMember.deleteMany({
    where: { teamId: { in: [id("team"), id("opponent"), id("new")] } },
  });
  await prisma.team.deleteMany({
    where: { id: { in: [id("team"), id("opponent"), id("new")] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [id("user"), id("opponent_user")] } },
  });
  await prisma.league.deleteMany({ where: { id: id("league") } });
}

async function main() {
  await cleanup();

  await prisma.league.create({
    data: {
      id: id("league"),
      name: "Priority Score Test League",
      slug: id("league_slug"),
      season: "Test",
      isActive: true,
    },
  });

  await prisma.user.create({
    data: { id: id("user"), name: "Priority Player", email: "priority-player@example.invalid" },
  });
  await prisma.user.create({
    data: { id: id("opponent_user"), name: "Opponent Player", email: "priority-opponent@example.invalid" },
  });

  await prisma.team.create({
    data: { id: id("team"), name: "Priority Team", claimCode: id("claim"), leagueId: id("league") },
  });
  await prisma.team.create({
    data: { id: id("opponent"), name: "Opponent Team", claimCode: id("opp_claim"), leagueId: id("league") },
  });
  await prisma.team.create({
    data: { id: id("new"), name: "Brand New Team", claimCode: id("new_claim"), leagueId: id("league") },
  });

  await prisma.teamMember.create({
    data: { id: id("member"), userId: id("user"), teamId: id("team"), role: "PLAYER" },
  });
  await prisma.teamMember.create({
    data: { id: id("opp_member"), userId: id("opponent_user"), teamId: id("opponent"), role: "PLAYER" },
  });

  for (let n = 1; n <= 5; n += 1) {
    const fixtureId = id(`fixture_${n}`);
    const resultId = id(`result_${n}`);
    const kickoffAt = new Date(`2026-09-0${n}T19:00:00.000Z`);
    const publishedAt = new Date(kickoffAt.getTime() - 7 * 24 * 60 * 60 * 1000);
    const confirmationAt = new Date(kickoffAt.getTime() - 4 * 24 * 60 * 60 * 1000);
    const completionAt = new Date(kickoffAt.getTime() + 14 * 60 * 60 * 1000);
    const dueDate = kickoffAt;
    const paidAt = new Date(
      kickoffAt.getTime() +
        (n === 5 ? 73 * 60 : n === 4 ? 2 * 60 : n === 3 ? 71 * 60 : -60) * 60 * 1000,
    );

    await prisma.fixture.create({
      data: {
        id: fixtureId,
        leagueId: id("league"),
        homeTeamId: id("team"),
        awayTeamId: id("opponent"),
        kickoffAt,
        publishedAt,
        status: "COMPLETED",
      },
    });

    await prisma.matchResult.create({
      data: {
        id: resultId,
        fixtureId,
        homeScore: n === 1 ? 2 : 1,
        awayScore: 0,
        enteredAt: new Date(kickoffAt.getTime() + 2 * 60 * 60 * 1000),
      },
    });

    await prisma.matchResultTeamMeta.create({
      data: {
        id: id(`meta_${n}`),
        matchResultId: resultId,
        teamId: id("team"),
        scorers: [{ teamMemberId: id("member"), name: "Priority Player", goals: 1, assists: 1 }],
        goalsRecorded: 1,
        ownGoals: n === 1 ? 1 : 0,
        playerOfMatchName: "Priority Player",
        priorityCoreCompletedAt: completionAt,
        priorityAssistsCompletedAt: completionAt,
        priorityRatingsCompletedAt: completionAt,
      },
    });

    await prisma.$executeRawUnsafe(`
      INSERT INTO "PlayerMatchPerformance" (
        "id","matchResultId","teamId","teamMemberId","played","appearanceRecorded",
        "rating","goals","assists","isPlayerOfMatch","source","createdAt","updatedAt"
      ) VALUES (
        '${id(`performance_${n}`)}','${resultId}','${id("team")}','${id("member")}',
        TRUE,TRUE,8.5,1,1,TRUE,'CAPTAIN_RECORDED','${completionAt.toISOString()}','${completionAt.toISOString()}'
      )
      ON CONFLICT ("matchResultId","teamId","teamMemberId") DO UPDATE SET
        "played"=TRUE,"appearanceRecorded"=TRUE,"rating"=8.5,"goals"=1,"assists"=1,
        "isPlayerOfMatch"=TRUE,"updatedAt"='${completionAt.toISOString()}'
    `);

    await prisma.fixtureCaptainConfirmation.create({
      data: {
        id: id(`confirmation_${n}`),
        fixtureId,
        teamId: id("team"),
        status: "CONFIRMED",
        confirmedAt: confirmationAt,
      },
    });

    const charge = await prisma.paymentCharge.create({
      data: {
        id: id(`charge_${n}`),
        teamId: id("team"),
        leagueId: id("league"),
        fixtureId,
        title: "Match fee",
        amountPence: 4000,
        dueDate,
        status: "PAID",
      },
    });

    await prisma.paymentTransaction.create({
      data: {
        id: id(`tx_${n}`),
        teamId: id("team"),
        chargeId: charge.id,
        amountPence: 4000,
        method: n === 4 ? "CASH" : "BANK_TRANSFER",
        paidAt,
        reference:
          n === 5
            ? "payment after 72-hour cutoff"
            : n === 4
              ? "cash paid on the match night after kick-off"
              : n === 3
                ? "payment just inside 72-hour cutoff"
                : "on-time payment test",
      },
    });
  }

  const score = await getSixflTvPriorityScore(
    id("team"),
    prisma,
  );

  assert.equal(score.matchesCount, 5);
  assert.equal(score.provisional, false);
  assert.equal(score.reliabilityScore, 96, "one late payment should reduce the reliability rate by four points");
  assert.equal(score.reliabilityPoints, 77, "96% reliability should contribute 77 of the 80 available Priority points");
  assert.equal(score.audiencePoints, 0);
  assert.equal(score.participationPoints, 0);
  assert.equal(score.score, 77, "the headline Priority score should be the single 100-point total");
  assert.equal(score.qualifies, true);
  assert.equal(score.coreCompletedMatches, 5);
  assert.equal(score.matches.reduce((sum, match) => sum + match.paymentPoints, 0), 26);
  assert.equal(score.matches.reduce((sum, match) => sum + match.confirmationPoints, 0), 20);
  assert.equal(score.matches.reduce((sum, match) => sum + match.matchCardPoints, 0), 40);
  assert.equal(score.matches.reduce((sum, match) => sum + match.assistsPoints, 0), 5);
  assert.equal(score.matches.reduce((sum, match) => sum + match.ratingsPoints, 0), 5);
  assert.equal(score.matches.filter((match) => match.paymentStatus === "LATE").length, 1);
  assert.equal(
    score.matches.find((match) => match.fixtureId === id("fixture_3"))?.paymentStatus,
    "ON_TIME",
    "a payment 71 hours after kick-off must still receive full payment points",
  );
  assert.equal(
    score.matches.find((match) => match.fixtureId === id("fixture_4"))?.paymentStatus,
    "ON_TIME",
    "cash recorded after kick-off on the match night must still count as on time",
  );
  assert.equal(
    score.matches.find((match) => match.fixtureId === id("fixture_5"))?.paymentStatus,
    "LATE",
    "a payment first completing the charge after the 72-hour cutoff must be late",
  );
  assert.equal(
    score.matches.find((match) => match.fixtureId === id("fixture_1"))?.coreComplete,
    true,
    "a player goal plus an own goal must count as a complete match card",
  );

  const newTeam = await getSixflTvPriorityScore(id("new"), prisma);
  assert.equal(newTeam.reliabilityScore, 100);
  assert.equal(newTeam.reliabilityPoints, 80);
  assert.equal(newTeam.score, 80, "a new team starts with full provisional reliability but no unearned engagement points");
  assert.equal(newTeam.provisional, true);
  assert.equal(newTeam.qualifies, true);

  // Account-wide debt is independent of the latest five match cards.
  const now = new Date("2026-09-24T21:30:00Z");
  await prisma.paymentCharge.create({ data: { id: id("old_debt"), teamId: id("team"), title: "Old balance", amountPence: 1, dueDate: new Date("2026-08-01T12:00:00Z"), status: "OPEN" } });
  const penalised = (await getSixflTvPriorityScores([id("team")], prisma, now)).get(id("team"))!;
  assert.equal(penalised.deductionPoints, 10);
  assert.equal(penalised.score, score.score - 10);
  await prisma.$executeRaw`INSERT INTO "SixflTvPriorityReview" (id,"teamId",kind,"referenceId",reason,"createdBy") VALUES (${id("hold")},${id("team")},'PAYMENT_HOLD',${id("old_debt")},'Disputed amount','test-admin')`;
  assert.equal((await getPriorityDeductionDetails([id("team")], prisma, now)).get(id("team"))!.deductionPoints, 0);
  await prisma.$executeRaw`UPDATE "SixflTvPriorityReview" SET "revokedAt"=${now} WHERE id=${id("hold")}`;
  await prisma.paymentTransaction.create({ data: { teamId: id("team"), chargeId: id("old_debt"), amountPence: 1, method: "OTHER", paidAt: now, notes: "SIXFL adjustment" } });
  assert.equal((await getPriorityDeductionDetails([id("team")], prisma, now)).get(id("team"))!.deductionPoints, 0, "Recorded adjustments must clear the deduction");
  await prisma.$executeRaw`INSERT INTO "TeamShinPadWarning" (id,"teamId","fixtureId","createdAt") VALUES (${id("warning")},${id("team")},${id("fixture_1")},${new Date("2026-09-23T20:00:00Z")})`;
  assert.equal((await getPriorityDeductionDetails([id("team")], prisma, now)).get(id("team"))!.deductionPoints, 5);
  await prisma.$executeRaw`INSERT INTO "SixflTvPriorityReview" (id,"teamId",kind,"referenceId",reason,"createdBy") VALUES (${id("warning_review")},${id("team")},'SHIN_PAD_DISMISSED',${id("warning")},'Recorded against wrong team','test-admin')`;
  assert.equal((await getPriorityDeductionDetails([id("team")], prisma, now)).get(id("team"))!.deductionPoints, 0);
  await prisma.$executeRaw`INSERT INTO "SixflTvPriorityReview" (id,"teamId",kind,"referenceId",points,reason,"createdBy") VALUES (${id("red")},${id("team")},'RED_CARD',${id("fixture_1")},20,'Serious sending-off confirmed','test-admin')`;
  assert.equal((await getPriorityDeductionDetails([id("team")], prisma, now)).get(id("team"))!.deductionPoints, 20);
  const afterExpiry = new Date("2026-10-30T21:30:00Z");
  assert.equal((await getPriorityDeductionDetails([id("team")], prisma, afterExpiry)).get(id("team"))!.deductionPoints, 0);

  // The screenshot case: no payment points are earned until fully covered.
  await prisma.$executeRaw`DELETE FROM "PaymentTransaction" WHERE "chargeId" IN (SELECT id FROM "PaymentCharge" WHERE "fixtureId"=${id("fixture_5")} AND "teamId"=${id("team")})`;
  await prisma.$executeRaw`UPDATE "PaymentCharge" SET "dueDate"=${new Date(now.getTime() - 24 * 3600000)},status='PAID' WHERE "fixtureId"=${id("fixture_5")} AND "teamId"=${id("team")}`;
  const pending = (await getSixflTvPriorityScores([id("team")], prisma, now)).get(id("team"))!.matches.find(row => row.fixtureId === id("fixture_5"))!;
  assert.equal(pending.paymentStatus, "PENDING");
  assert.equal(pending.paymentPoints, 0);
  const chargeFive = await prisma.paymentCharge.findFirstOrThrow({ where: { fixtureId: id("fixture_5"), teamId: id("team") } });
  await prisma.paymentTransaction.create({ data: { id: id("partial_payment"), teamId: id("team"), chargeId: chargeFive.id, amountPence: chargeFive.amountPence - 1, method: "OTHER", paidAt: now } });
  const partial = (await getSixflTvPriorityScores([id("team")], prisma, now)).get(id("team"))!.matches.find(row => row.fixtureId === id("fixture_5"))!;
  assert.equal(partial.paymentPoints, 0, "Even one penny remaining must earn zero payment points");
  await prisma.paymentTransaction.create({ data: { id: id("final_penny"), teamId: id("team"), chargeId: chargeFive.id, amountPence: 1, method: "OTHER", paidAt: now } });
  const paid = (await getSixflTvPriorityScores([id("team")], prisma, now)).get(id("team"))!.matches.find(row => row.fixtureId === id("fixture_5"))!;
  assert.equal(paid.paymentStatus, "ON_TIME");
  assert.equal(paid.paymentPoints, 6, "The points are earned when the final penny clears the charge");
  await prisma.paymentTransaction.deleteMany({ where: { id: { in: [id("partial_payment"), id("final_penny")] } } });
  const late = (await getSixflTvPriorityScores([id("team")], prisma, new Date(now.getTime() + 72 * 3600000))).get(id("team"))!.matches.find(row => row.fixtureId === id("fixture_5"))!;
  assert.equal(late.paymentStatus, "UNPAID", "A stale PAID flag must not bypass actual receipts or the 72-hour deadline");
  assert.equal(late.paymentPoints, 0);
  console.log("SIXFL TV Priority score database checks passed");
}

main()
  .finally(async () => {
    await cleanup().catch(() => {});
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
