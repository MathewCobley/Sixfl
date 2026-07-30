const fs = require("node:fs");
const path = require("node:path");

const actionsPath = path.join(
  process.cwd(),
  "src",
  "app",
  "(admin)",
  "admin",
  "fixtures",
  "actions-legacy.ts",
);
const pagePath = path.join(
  process.cwd(),
  "src",
  "app",
  "(admin)",
  "admin",
  "fixtures",
  "[id]",
  "result",
  "page.tsx",
);

if (!fs.existsSync(actionsPath)) {
  console.warn("Completed result correction patch skipped: fixture actions file not found.");
  process.exit(0);
}

let actionsSource = fs.readFileSync(actionsPath, "utf8");
let actionsChanged = false;

const fixtureSelectBefore = `      id: true,
      leagueId: true,
      league: {`;
const fixtureSelectAfter = `      id: true,
      leagueId: true,
      status: true,
      league: {`;

if (actionsSource.includes(fixtureSelectBefore) && !actionsSource.includes(fixtureSelectAfter)) {
  actionsSource = actionsSource.replace(fixtureSelectBefore, fixtureSelectAfter);
  actionsChanged = true;
}

const confirmationValueBefore = `  const returnTo = getSafeAdminFixturesReturnTo(formData.get("returnTo"));`;
const confirmationValueAfter = `  const returnTo = getSafeAdminFixturesReturnTo(formData.get("returnTo"));
  const completedResultChangeConfirmed =
    String(formData.get("confirmCompletedResultChange") ?? "") === "yes";`;

if (
  actionsSource.includes(confirmationValueBefore) &&
  !actionsSource.includes("completedResultChangeConfirmed")
) {
  actionsSource = actionsSource.replace(confirmationValueBefore, confirmationValueAfter);
  actionsChanged = true;
}

const fixtureGuardBefore = `  if (!fixture) {
    throw new Error("Fixture not found.");
  }

  await prisma.$transaction`;
const fixtureGuardAfter = `  if (!fixture) {
    throw new Error("Fixture not found.");
  }

  if (
    fixture.status === FixtureStatus.COMPLETED &&
    !completedResultChangeConfirmed
  ) {
    throw new Error(
      "Please confirm that you intend to change this completed result.",
    );
  }

  await prisma.$transaction`;

if (
  actionsSource.includes(fixtureGuardBefore) &&
  !actionsSource.includes("Please confirm that you intend to change this completed result")
) {
  actionsSource = actionsSource.replace(fixtureGuardBefore, fixtureGuardAfter);
  actionsChanged = true;
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

if (actionsSource.includes(transactionBefore)) {
  actionsSource = actionsSource.replace(transactionBefore, transactionAfter);
  actionsChanged = true;
}

if (actionsChanged) {
  fs.writeFileSync(actionsPath, actionsSource);
  console.log("Applied admin completed-result correction and confirmation fix.");
} else {
  console.log("Admin completed-result correction and confirmation fix already applied or source changed.");
}

if (!fs.existsSync(pagePath)) {
  console.warn("Completed result confirmation UI patch skipped: result page not found.");
  process.exit(0);
}

let pageSource = fs.readFileSync(pagePath, "utf8");
let pageChanged = false;

const actionsBlockBefore = `          <div className="flex flex-wrap gap-3 border-t border-white/10 pt-5">
            <button type="submit" className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300">
              Save result
            </button>`;

const actionsBlockAfter = `          {fixture.status === "COMPLETED" ? (
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-50">
              <input
                type="checkbox"
                name="confirmCompletedResultChange"
                value="yes"
                required
                className="mt-0.5 h-5 w-5 shrink-0 accent-amber-400"
              />
              <span>
                <span className="block font-semibold">Confirm completed-result correction</span>
                <span className="mt-1 block text-amber-100/75">
                  I have checked both scores and understand this will replace the result already recorded for this completed fixture.
                </span>
              </span>
            </label>
          ) : null}

          <div className="flex flex-wrap gap-3 border-t border-white/10 pt-5">
            <button type="submit" className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300">
              {fixture.status === "COMPLETED" ? "Update completed result" : "Save result"}
            </button>`;

if (
  pageSource.includes(actionsBlockBefore) &&
  !pageSource.includes("confirmCompletedResultChange")
) {
  pageSource = pageSource.replace(actionsBlockBefore, actionsBlockAfter);
  pageChanged = true;
}

if (pageChanged) {
  fs.writeFileSync(pagePath, pageSource);
  console.log("Applied completed-result confirmation UI.");
} else {
  console.log("Completed-result confirmation UI already applied or source changed.");
}
