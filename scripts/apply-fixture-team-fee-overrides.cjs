const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function replaceOnce(filePath, before, after) {
  const absolutePath = path.join(root, filePath);
  const source = fs.readFileSync(absolutePath, "utf8");

  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected fixture fee source was not found in ${filePath}`);
  }

  fs.writeFileSync(absolutePath, source.replace(before, after), "utf8");
}

function replaceAllExact(filePath, before, after, minimumCount = 1) {
  const absolutePath = path.join(root, filePath);
  const source = fs.readFileSync(absolutePath, "utf8");

  if (source.includes(after)) return;
  const count = source.split(before).length - 1;
  if (count < minimumCount) {
    throw new Error(`Expected ${minimumCount} fixture fee source occurrence(s) in ${filePath}; found ${count}`);
  }

  fs.writeFileSync(absolutePath, source.replaceAll(before, after), "utf8");
}

replaceOnce(
  "prisma/schema.prisma",
  '  publishedAt   DateTime?\n  matchFeePence Int?',
  '  publishedAt          DateTime?\n  matchFeePence       Int?\n  homeMatchFeePence   Int?\n  awayMatchFeePence   Int?',
);

replaceOnce(
  "src/app/(admin)/admin/fixtures/[id]/edit/actions.ts",
  '          status,\n          matchFeePence: fixtureMatchFeePence,',
  '          status,\n          matchFeePence: fixtureMatchFeePence,\n          homeMatchFeePence,\n          awayMatchFeePence,',
);

replaceOnce(
  "src/app/(admin)/admin/fixtures/[id]/edit/page.tsx",
  '      status: true,\n      matchFeePence: true,\n      publishedAt: true,',
  '      status: true,\n      matchFeePence: true,\n      homeMatchFeePence: true,\n      awayMatchFeePence: true,\n      publishedAt: true,',
);

replaceOnce(
  "src/app/(admin)/admin/fixtures/[id]/edit/page.tsx",
  '  const homeCharge = charges.find((charge) => charge.teamId === fixture.homeTeamId);\n  const awayCharge = charges.find((charge) => charge.teamId === fixture.awayTeamId);\n  const hasTeamSpecificCharges = charges.length > 0;\n  const legacyFixtureFee = hasTeamSpecificCharges ? null : fixture.matchFeePence ?? null;\n  const homeFee = homeCharge?.amountPence ?? legacyFixtureFee;\n  const awayFee = awayCharge?.amountPence ?? legacyFixtureFee;',
  '  const homeCharge = charges.find((charge) => charge.teamId === fixture.homeTeamId);\n  const awayCharge = charges.find((charge) => charge.teamId === fixture.awayTeamId);\n  const legacyFixtureFee = fixture.matchFeePence ?? null;\n  const homeFee =\n    homeCharge?.amountPence ?? fixture.homeMatchFeePence ?? legacyFixtureFee;\n  const awayFee =\n    awayCharge?.amountPence ?? fixture.awayMatchFeePence ?? legacyFixtureFee;',
);

replaceOnce(
  "src/app/api/admin/fixtures/matchup-grid/route.ts",
  '        publishedAt: true,\n        matchFeePence: true,\n        venue: { select: { name: true } },',
  '        publishedAt: true,\n        matchFeePence: true,\n        homeMatchFeePence: true,\n        awayMatchFeePence: true,\n        venue: { select: { name: true } },',
);

replaceOnce(
  "src/app/api/admin/fixtures/matchup-grid/route.ts",
  '      function getFeeInfo(charge: typeof fixture.paymentCharges[number] | undefined) {\n        const amountPence = charge?.amountPence ?? legacyFee;',
  '      function getFeeInfo(\n        charge: typeof fixture.paymentCharges[number] | undefined,\n        expectedFeePence: number | null,\n      ) {\n        const amountPence = charge?.amountPence ?? expectedFeePence ?? legacyFee;',
);

replaceOnce(
  "src/app/api/admin/fixtures/matchup-grid/route.ts",
  '      const homeFee = getFeeInfo(homeCharge);\n      const awayFee = getFeeInfo(awayCharge);',
  '      const homeFee = getFeeInfo(homeCharge, fixture.homeMatchFeePence);\n      const awayFee = getFeeInfo(awayCharge, fixture.awayMatchFeePence);',
);

replaceOnce(
  "src/app/api/admin/fixtures/publish-one/route.ts",
  '  matchFeePence: number | null;\n  homeTeam:',
  '  matchFeePence: number | null;\n  homeMatchFeePence: number | null;\n  awayMatchFeePence: number | null;\n  homeTeam:',
);

replaceOnce(
  "src/app/api/admin/fixtures/publish-one/route.ts",
  '      pitch: true,\n      matchFeePence: true,\n      publishedAt: true,',
  '      pitch: true,\n      matchFeePence: true,\n      homeMatchFeePence: true,\n      awayMatchFeePence: true,\n      publishedAt: true,',
);

replaceOnce(
  "src/app/api/admin/fixtures/publish-one/route.ts",
  '          pitch: true,\n          matchFeePence: true,\n          publishedAt: true,',
  '          pitch: true,\n          matchFeePence: true,\n          homeMatchFeePence: true,\n          awayMatchFeePence: true,\n          publishedAt: true,',
);

replaceOnce(
  "src/app/api/admin/fixtures/publish-one/route.ts",
  '  const { fixture, league } = input;\n  const matchFeePence = fixture.matchFeePence ?? DEFAULT_MATCH_FEE_PENCE;',
  '  const { fixture, league } = input;\n  const homeMatchFeePence =\n    fixture.homeMatchFeePence ?? fixture.matchFeePence ?? DEFAULT_MATCH_FEE_PENCE;\n  const awayMatchFeePence =\n    fixture.awayMatchFeePence ?? fixture.matchFeePence ?? DEFAULT_MATCH_FEE_PENCE;',
);

replaceAllExact(
  "src/app/api/admin/fixtures/publish-one/route.ts",
  '    homeMatchFeePence: matchFeePence,\n    awayMatchFeePence: matchFeePence,',
  '    homeMatchFeePence,\n    awayMatchFeePence,',
  2,
);

replaceOnce(
  "src/app/(admin)/admin/fixtures/publish-actions.ts",
  '  matchFeePence: number | null;\n  homeTeam:',
  '  matchFeePence: number | null;\n  homeMatchFeePence: number | null;\n  awayMatchFeePence: number | null;\n  homeTeam:',
);

replaceOnce(
  "src/app/(admin)/admin/fixtures/publish-actions.ts",
  '            pitch: true,\n            matchFeePence: true,\n            homeTeam:',
  '            pitch: true,\n            matchFeePence: true,\n            homeMatchFeePence: true,\n            awayMatchFeePence: true,\n            homeTeam:',
);

replaceOnce(
  "src/app/(admin)/admin/fixtures/publish-actions.ts",
  '  for (const fixture of unpublishedFixtures) {\n    const matchFeePence = fixture.matchFeePence ?? DEFAULT_MATCH_FEE_PENCE;',
  '  for (const fixture of unpublishedFixtures) {\n    const homeMatchFeePence =\n      fixture.homeMatchFeePence ?? fixture.matchFeePence ?? DEFAULT_MATCH_FEE_PENCE;\n    const awayMatchFeePence =\n      fixture.awayMatchFeePence ?? fixture.matchFeePence ?? DEFAULT_MATCH_FEE_PENCE;',
);

replaceAllExact(
  "src/app/(admin)/admin/fixtures/publish-actions.ts",
  '      homeMatchFeePence: matchFeePence,\n      awayMatchFeePence: matchFeePence,',
  '      homeMatchFeePence,\n      awayMatchFeePence,',
  2,
);

replaceOnce(
  "src/app/api/admin/night-board/update-match/route.ts",
  'function getExistingTeamFee(input: {\n  fixtureMatchFeePence: number | null;\n  teamId: string;',
  'function getExistingTeamFee(input: {\n  fixtureMatchFeePence: number | null;\n  fixtureTeamMatchFeePence: number | null;\n  teamId: string;',
);

replaceOnce(
  "src/app/api/admin/night-board/update-match/route.ts",
  '  return existing?.amountPence ?? input.fixtureMatchFeePence ?? null;',
  '  return (\n    existing?.amountPence ??\n    input.fixtureTeamMatchFeePence ??\n    input.fixtureMatchFeePence ??\n    null\n  );',
);

replaceOnce(
  "src/app/api/admin/night-board/update-match/route.ts",
  '      status: true,\n      matchFeePence: true,\n      refereeId: true,',
  '      status: true,\n      matchFeePence: true,\n      homeMatchFeePence: true,\n      awayMatchFeePence: true,\n      refereeId: true,',
);

replaceOnce(
  "src/app/api/admin/night-board/update-match/route.ts",
  '  const homeMatchFeePence = getExistingTeamFee({\n    fixtureMatchFeePence: fixture.matchFeePence,\n    teamId: fixture.homeTeam.id,',
  '  const homeMatchFeePence = getExistingTeamFee({\n    fixtureMatchFeePence: fixture.matchFeePence,\n    fixtureTeamMatchFeePence: fixture.homeMatchFeePence,\n    teamId: fixture.homeTeam.id,',
);

replaceOnce(
  "src/app/api/admin/night-board/update-match/route.ts",
  '  const awayMatchFeePence = getExistingTeamFee({\n    fixtureMatchFeePence: fixture.matchFeePence,\n    teamId: fixture.awayTeam.id,',
  '  const awayMatchFeePence = getExistingTeamFee({\n    fixtureMatchFeePence: fixture.matchFeePence,\n    fixtureTeamMatchFeePence: fixture.awayMatchFeePence,\n    teamId: fixture.awayTeam.id,',
);

replaceOnce(
  "src/app/(admin)/admin/fixtures/actions-legacy.ts",
  '  if (amount === 0) {\n    return null;\n  }\n\n  return Math.round(amount * 100);',
  '  return Math.round(amount * 100);',
);

replaceAllExact(
  "src/app/(admin)/admin/fixtures/actions-legacy.ts",
  '        status,\n        matchFeePence: fixtureMatchFeePence,',
  '        status,\n        matchFeePence: fixtureMatchFeePence,\n        homeMatchFeePence,\n        awayMatchFeePence,',
  2,
);

replaceOnce(
  "src/app/(admin)/admin/fixtures/actions-legacy.ts",
  '          matchFeePence: true,\n          status: true,',
  '          matchFeePence: true,\n          homeMatchFeePence: true,\n          awayMatchFeePence: true,\n          status: true,',
);

replaceOnce(
  "src/app/(admin)/admin/fixtures/actions-legacy.ts",
  '  const hadExistingFee = (fixture.matchFeePence ?? 0) > 0;\n  const hasMatchFee = (fixtureMatchFeePence ?? 0) > 0;',
  '  const hadExistingFee =\n    (fixture.homeMatchFeePence ?? fixture.matchFeePence ?? 0) > 0 ||\n    (fixture.awayMatchFeePence ?? fixture.matchFeePence ?? 0) > 0;\n  const hasMatchFee =\n    (homeMatchFeePence ?? 0) > 0 || (awayMatchFeePence ?? 0) > 0;',
);

replaceOnce(
  "src/app/(admin)/admin/fixtures/actions-legacy.ts",
  '  const feeAmountChanged =\n    (fixture.matchFeePence ?? 0) !== (fixtureMatchFeePence ?? 0);',
  '  const feeAmountChanged =\n    (fixture.homeMatchFeePence ?? fixture.matchFeePence ?? 0) !==\n      (homeMatchFeePence ?? 0) ||\n    (fixture.awayMatchFeePence ?? fixture.matchFeePence ?? 0) !==\n      (awayMatchFeePence ?? 0);',
);

console.log("Applied team-specific fixture fee persistence and publishing safeguards.");
