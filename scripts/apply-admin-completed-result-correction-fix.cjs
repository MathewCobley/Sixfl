const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(
  process.cwd(),
  "src",
  "app",
  "(admin)",
  "admin",
  "fixtures",
  "actions-legacy.ts",
);

if (!fs.existsSync(filePath)) {
  console.warn("Completed result correction patch skipped: fixture actions file not found.");
  process.exit(0);
}

let source = fs.readFileSync(filePath, "utf8");
let changed = false;

const fixtureSelectBefore = `      id: true,
      leagueId: true,
      league: {`;
const fixtureSelectAfter = `      id: true,
      leagueId: true,
      status: true,
      league: {`;

if (source.includes(fixtureSelectBefore) && !source.includes(fixtureSelectAfter)) {
  source = source.replace(fixtureSelectBefore, fixtureSelectAfter);
  changed = true;
}

const transactionBefore = `  await prisma.$transaction([
    prisma.matchResult.upsert({
      where: { fixtureId },
      update: {
        homeScore,
        awayScore,
        enteredAt: new Date(),
      },
      create: {
        fixtureId,
        homeScore,
        awayScore,
      },
    }),
    prisma.fixture.update({
      where: { id: fixtureId },
      data: {
        status: FixtureStatus.COMPLETED,
      },
    }),
  ]);`;

const transactionAfter = `  await prisma.$transaction(async (tx) => {
    await tx.matchResult.upsert({
      where: { fixtureId },
      update: {
        homeScore,
        awayScore,
        enteredAt: new Date(),
      },
      create: {
        fixtureId,
        homeScore,
        awayScore,
      },
    });

    // A completed fixture is intentionally locked against fixture-detail edits,
    // but an admin must still be able to correct its recorded score. Avoid a
    // redundant fixture update when it is already completed so the global lock
    // remains intact for all other fixture fields.
    if (fixture.status !== FixtureStatus.COMPLETED) {
      await tx.fixture.update({
        where: { id: fixtureId },
        data: {
          status: FixtureStatus.COMPLETED,
        },
      });
    }
  });`;

if (source.includes(transactionBefore)) {
  source = source.replace(transactionBefore, transactionAfter);
  changed = true;
}

if (changed) {
  fs.writeFileSync(filePath, source);
  console.log("Applied admin completed-result correction fix.");
} else {
  console.log("Admin completed-result correction fix already applied or source changed.");
}
