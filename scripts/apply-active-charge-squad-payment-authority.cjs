const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const actionPath =
  "src/app/captain/team/[teamid]/player-payments/actions.ts";
const absolutePath = path.join(root, actionPath);

let source = fs.readFileSync(absolutePath, "utf8");

const before = [
  '  const teamFeePence = getFixtureTeamFeePence({ fixture, teamId });',
  '',
  '  if (!teamFeePence || teamFeePence <= 0) {',
  '    redirect(getPlayerPaymentsPath(teamId, fixtureId, "&error=no_team_fee"));',
  '  }',
  '',
  '  const chargeSync = await syncFixtureMatchFeeCharges({',
  '    fixtureId: fixture.id,',
  '    leagueId: fixture.leagueId,',
  '    leagueName: fixture.league.name,',
  '    leagueSeason: fixture.league.season,',
  '    kickoffAt: fixture.kickoffAt,',
  '    homeTeam: fixture.homeTeam,',
  '    awayTeam: fixture.awayTeam,',
  '    homeMatchFeePence:',
  '      fixture.homeMatchFeePence ?? fixture.matchFeePence,',
  '    awayMatchFeePence:',
  '      fixture.awayMatchFeePence ?? fixture.matchFeePence,',
  '  });',
].join("\n");

const after = [
  '  const existingFixtureCharges = await prisma.paymentCharge.findMany({',
  '    where: {',
  '      fixtureId: fixture.id,',
  '      status: { not: "VOID" },',
  '    },',
  '    select: { teamId: true, amountPence: true },',
  '  });',
  '  const existingChargeByTeamId = new Map(',
  '    existingFixtureCharges.map((charge) => [charge.teamId, charge.amountPence] as const),',
  '  );',
  '',
  '  const storedHomeFeePence =',
  '    fixture.homeMatchFeePence ?? fixture.matchFeePence;',
  '  const storedAwayFeePence =',
  '    fixture.awayMatchFeePence ?? fixture.matchFeePence;',
  '  const resolvedHomeFeePence =',
  '    existingChargeByTeamId.get(fixture.homeTeam.id) ?? storedHomeFeePence;',
  '  const resolvedAwayFeePence =',
  '    existingChargeByTeamId.get(fixture.awayTeam.id) ?? storedAwayFeePence;',
  '  const teamFeePence =',
  '    fixture.homeTeam.id === teamId',
  '      ? resolvedHomeFeePence',
  '      : fixture.awayTeam.id === teamId',
  '        ? resolvedAwayFeePence',
  '        : null;',
  '',
  '  if (!teamFeePence || teamFeePence <= 0) {',
  '    redirect(getPlayerPaymentsPath(teamId, fixtureId, "&error=no_team_fee"));',
  '  }',
  '',
  '  const staleFixtureFeeRepair: {',
  '    homeMatchFeePence?: number;',
  '    awayMatchFeePence?: number;',
  '  } = {};',
  '  const existingHomeChargePence = existingChargeByTeamId.get(fixture.homeTeam.id);',
  '  const existingAwayChargePence = existingChargeByTeamId.get(fixture.awayTeam.id);',
  '',
  '  if (',
  '    existingHomeChargePence &&',
  '    existingHomeChargePence > 0 &&',
  '    (!storedHomeFeePence || storedHomeFeePence <= 0)',
  '  ) {',
  '    staleFixtureFeeRepair.homeMatchFeePence = existingHomeChargePence;',
  '  }',
  '',
  '  if (',
  '    existingAwayChargePence &&',
  '    existingAwayChargePence > 0 &&',
  '    (!storedAwayFeePence || storedAwayFeePence <= 0)',
  '  ) {',
  '    staleFixtureFeeRepair.awayMatchFeePence = existingAwayChargePence;',
  '  }',
  '',
  '  // Completed fixtures stay immutable. Their existing charge can still be used',
  '  // for player-payment collection without repairing historical fixture fields.',
  '  if (',
  '    fixture.status !== "COMPLETED" &&',
  '    Object.keys(staleFixtureFeeRepair).length > 0',
  '  ) {',
  '    await prisma.fixture.update({',
  '      where: { id: fixture.id },',
  '      data: staleFixtureFeeRepair,',
  '    });',
  '  }',
  '',
  '  const chargeSync = await syncFixtureMatchFeeCharges({',
  '    fixtureId: fixture.id,',
  '    leagueId: fixture.leagueId,',
  '    leagueName: fixture.league.name,',
  '    leagueSeason: fixture.league.season,',
  '    kickoffAt: fixture.kickoffAt,',
  '    homeTeam: fixture.homeTeam,',
  '    awayTeam: fixture.awayTeam,',
  '    homeMatchFeePence: resolvedHomeFeePence,',
  '    awayMatchFeePence: resolvedAwayFeePence,',
  '  });',
].join("\n");

if (!source.includes(after)) {
  if (!source.includes(before)) {
    throw new Error(
      "Expected captain squad-payment fee-authority block was not found after source preparation.",
    );
  }
  source = source.replace(before, after);
  fs.writeFileSync(absolutePath, source, "utf8");
}

const verification = fs.readFileSync(absolutePath, "utf8");
for (const marker of [
  'existingFixtureCharges = await prisma.paymentCharge.findMany',
  'status: { not: "VOID" }',
  'existingChargeByTeamId.get(fixture.homeTeam.id) ?? storedHomeFeePence',
  'existingChargeByTeamId.get(fixture.awayTeam.id) ?? storedAwayFeePence',
  'staleFixtureFeeRepair.homeMatchFeePence = existingHomeChargePence',
  'staleFixtureFeeRepair.awayMatchFeePence = existingAwayChargePence',
  'fixture.status !== "COMPLETED"',
  'homeMatchFeePence: resolvedHomeFeePence',
  'awayMatchFeePence: resolvedAwayFeePence',
]) {
  if (!verification.includes(marker)) {
    throw new Error(`Active-charge squad-payment authority marker missing: ${marker}`);
  }
}

console.log(
  "Captain squad payments now use active fixture charges, keep completed fixtures immutable, and only repair stale fixture fee fields before completion.",
);
