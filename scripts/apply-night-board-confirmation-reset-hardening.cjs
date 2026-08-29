const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const files = {
  route: "src/app/api/admin/night-board/update-match/route.ts",
  notifications: "src/lib/fixtures/night-board-change-notifications.ts",
};

function read(relativePath) {
  const absolutePath = path.join(root, ...relativePath.split("/"));
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Night Board confirmation reset hardening: ${relativePath} was not found.`);
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function write(relativePath, source) {
  fs.writeFileSync(path.join(root, ...relativePath.split("/")), source, "utf8");
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) {
    return { source, changed: false };
  }
  if (!source.includes(before)) {
    throw new Error(`Night Board confirmation reset hardening: ${label} anchor was not found.`);
  }
  return { source: source.replace(before, after), changed: true };
}

function patchNotificationService() {
  let source = read(files.notifications);
  let changed = false;

  function replace(before, after, label) {
    const result = replaceOnce(source, before, after, label);
    source = result.source;
    changed = result.changed || changed;
  }

  replace(
    "async function resetConfirmedTeams(input: {",
    "async function resetTeamResponses(input: {",
    "reset helper name",
  );

  replace(
    "      status: FixtureCaptainConfirmationStatus.CONFIRMED,",
    `      status: {
        in: [
          FixtureCaptainConfirmationStatus.PENDING,
          FixtureCaptainConfirmationStatus.CONFIRMED,
          FixtureCaptainConfirmationStatus.ISSUE_RAISED,
        ],
      },`,
    "all confirmation response states",
  );

  replace(
    `      confirmedAt: null,
      confirmedByUserId: null,
      note,`,
    `      confirmedAt: null,
      issueRaisedAt: null,
      lastChasedAt: null,
      confirmedByUserId: null,
      note,`,
    "clear stale response timestamps",
  );

  replace(
    "    await resetConfirmedTeams({",
    "    await resetTeamResponses({",
    "reset helper call",
  );

  const required = [
    "async function resetTeamResponses(input: {",
    "FixtureCaptainConfirmationStatus.ISSUE_RAISED",
    "issueRaisedAt: null",
    "lastChasedAt: null",
    "await resetTeamResponses({",
  ];
  for (const token of required) {
    if (!source.includes(token)) {
      throw new Error(`Night Board confirmation reset hardening: notification service is missing ${token}.`);
    }
  }

  if (changed) write(files.notifications, source);
  return changed;
}

function patchUpdateRoute() {
  let source = read(files.route);
  let changed = false;

  function replace(before, after, label) {
    const result = replaceOnce(source, before, after, label);
    source = result.source;
    changed = result.changed || changed;
  }

  replace(
    `import {
  FixtureStatus,`,
    `import {
  FixtureCaptainConfirmationStatus,
  FixtureStatus,`,
    "confirmation status import",
  );

  if (!source.includes("function getConfirmationResetNote(")) {
    const anchor = "function buildReturnToWithSaveNotice(input: {";
    const helper = `function getConfirmationResetNote(status: FixtureStatus) {
  if (status === FixtureStatus.SCHEDULED) {
    return "Fixture details changed on the Night Board. Team needs to confirm the updated fixture.";
  }
  if (status === FixtureStatus.CANCELLED) {
    return "Fixture cancelled on the Night Board. The previous team response is no longer current.";
  }
  return "Fixture postponed on the Night Board. The previous team response is no longer current.";
}

`;
    if (!source.includes(anchor)) {
      throw new Error("Night Board confirmation reset hardening: save notice helper anchor was not found.");
    }
    source = source.replace(anchor, `${helper}${anchor}`);
    changed = true;
  }

  if (!source.includes("const teamFacingDetailsChanged =")) {
    const anchor = "  const nextRefereeId = referee?.id ?? null;";
    const calculation = `  const previousVenueName = fixture.venue?.name ?? fixture.league.venueName ?? null;
  const nextVenueName = venue?.name ?? fixture.league.venueName ?? null;
  const teamFacingDetailsChanged =
    kickoffAt.getTime() !== fixture.kickoffAt.getTime() ||
    fixture.venueId !== venueId ||
    previousVenueName !== nextVenueName ||
    fixture.status !== status;
  const shouldResetTeamResponses =
    Boolean(fixture.publishedAt) &&
    teamFacingDetailsChanged &&
    status !== FixtureStatus.COMPLETED;

`;
    if (!source.includes(anchor)) {
      throw new Error("Night Board confirmation reset hardening: referee assignment anchor was not found.");
    }
    source = source.replace(anchor, `${calculation}${anchor}`);
    changed = true;
  }

  replace(
    `  await prisma.fixture.update({
    where: { id: fixture.id },
    data: {
      kickoffAt,
      pitch: pitch || null,
      venueId,
      refereeId: nextRefereeId,
      status,
    },
  });`,
    `  await prisma.$transaction(async (tx) => {
    await tx.fixture.update({
      where: { id: fixture.id },
      data: {
        kickoffAt,
        pitch: pitch || null,
        venueId,
        refereeId: nextRefereeId,
        status,
      },
    });

    if (shouldResetTeamResponses) {
      await tx.fixtureCaptainConfirmation.updateMany({
        where: {
          fixtureId: fixture.id,
          teamId: { in: [fixture.homeTeam.id, fixture.awayTeam.id] },
          status: {
            in: [
              FixtureCaptainConfirmationStatus.PENDING,
              FixtureCaptainConfirmationStatus.CONFIRMED,
              FixtureCaptainConfirmationStatus.ISSUE_RAISED,
            ],
          },
        },
        data: {
          status: FixtureCaptainConfirmationStatus.PENDING,
          confirmedAt: null,
          issueRaisedAt: null,
          lastChasedAt: null,
          confirmedByUserId: null,
          note: getConfirmationResetNote(status),
        },
      });
    }
  });`,
    "atomic fixture and confirmation update",
  );

  const required = [
    "FixtureCaptainConfirmationStatus.ISSUE_RAISED",
    "const teamFacingDetailsChanged =",
    "const shouldResetTeamResponses =",
    "await prisma.$transaction(async (tx) => {",
    "await tx.fixtureCaptainConfirmation.updateMany({",
    "issueRaisedAt: null",
    "lastChasedAt: null",
    "note: getConfirmationResetNote(status)",
  ];
  for (const token of required) {
    if (!source.includes(token)) {
      throw new Error(`Night Board confirmation reset hardening: update route is missing ${token}.`);
    }
  }

  const transactionPosition = source.indexOf("await prisma.$transaction(async (tx) => {");
  const fixtureUpdatePosition = source.indexOf("await tx.fixture.update({", transactionPosition);
  const confirmationResetPosition = source.indexOf(
    "await tx.fixtureCaptainConfirmation.updateMany({",
    transactionPosition,
  );
  const paymentSyncPosition = source.indexOf("const sync = await resyncMatchFeeMessages({");
  const notificationPosition = source.indexOf(
    "await queueNightBoardFixtureChangeNotifications({",
  );

  if (
    transactionPosition < 0 ||
    fixtureUpdatePosition < transactionPosition ||
    confirmationResetPosition < fixtureUpdatePosition ||
    paymentSyncPosition < confirmationResetPosition ||
    notificationPosition < paymentSyncPosition
  ) {
    throw new Error(
      "Night Board confirmation reset hardening: confirmations must reset atomically before payment and notification follow-up work.",
    );
  }

  if (changed) write(files.route, source);
  return changed;
}

function applyAll() {
  return [patchNotificationService(), patchUpdateRoute()].filter(Boolean).length;
}

const firstPassChangedFiles = applyAll();
const secondPassChangedFiles = applyAll();

if (secondPassChangedFiles !== 0) {
  throw new Error("Night Board confirmation reset hardening is not idempotent.");
}

if (firstPassChangedFiles > 0) {
  console.log(`Night Board confirmation reset hardening applied to ${firstPassChangedFiles} file(s).`);
} else {
  console.log("Night Board confirmation reset hardening already applied.");
}
