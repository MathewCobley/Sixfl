import assert from "node:assert/strict";

import { prisma } from "../../src/lib/prisma";
import { getSixflTvPriorityScore } from "../../src/lib/sixfl-tv/priority-score";

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
        (n === 5 ? 26 * 60 : n === 4 ? 2 * 60 : -60) * 60 * 1000,
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
            ? "next-day late payment test"
            : n === 4
              ? "cash paid on the match night after kick-off"
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
    score.matches.find((match) => match.fixtureId === id("fixture_4"))?.paymentStatus,
    "ON_TIME",
    "cash recorded after kick-off on the same London match day must still count as on time",
  );
  assert.equal(
    score.matches.find((match) => match.fixtureId === id("fixture_5"))?.paymentStatus,
    "LATE",
    "a payment first completing the charge on the following day must remain late",
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
