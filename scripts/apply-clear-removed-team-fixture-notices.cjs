const fs = require("node:fs");
const path = require("node:path");

const routePath = path.join(
  process.cwd(),
  "src",
  "app",
  "api",
  "admin",
  "fixtures",
  "change-notice",
  "route.ts",
);

function countOccurrences(source, value) {
  return source.split(value).length - 1;
}

function applyPatch() {
  if (!fs.existsSync(routePath)) {
    throw new Error("Fixture change-notice route was not found.");
  }

  let source = fs.readFileSync(routePath, "utf8");
  let changed = false;

  function replaceOnce(before, after, label) {
    if (source.includes(after)) return;
    if (!source.includes(before)) {
      throw new Error(`Removed-team fixture notice: ${label} anchor was not found.`);
    }
    source = source.replace(before, after);
    changed = true;
  }

  replaceOnce(
    [
      'const RECONFIRM_SOURCE_TYPE = "FIXTURE_CHANGE_NOTICE";',
      'const STATUS_SOURCE_TYPE = "FIXTURE_STATUS_NOTICE";',
    ].join("\n"),
    [
      'const RECONFIRM_SOURCE_TYPE = "FIXTURE_CHANGE_NOTICE";',
      'const STATUS_SOURCE_TYPE = "FIXTURE_STATUS_NOTICE";',
      'const OPPONENT_CHANGED_SOURCE_TYPE = "FIXTURE_OPPONENT_CHANGED_NOTICE";',
    ].join("\n"),
    "opposition-change source type",
  );

  replaceOnce(
    [
      "function buildCaptainFixturesUrl(teamId: string, fixtureId: string) {",
      "  return `${getSiteUrl()}/captain/team/${teamId}/fixtures?fixtureId=${encodeURIComponent(fixtureId)}`;",
      "}",
    ].join("\n"),
    [
      "function buildCaptainFixturesUrl(teamId: string, fixtureId?: string) {",
      "  const baseUrl = `${getSiteUrl()}/captain/team/${teamId}/fixtures`;",
      "  return fixtureId",
      "    ? `${baseUrl}?fixtureId=${encodeURIComponent(fixtureId)}`",
      "    : baseUrl;",
      "}",
    ].join("\n"),
    "captain fixtures URL helper",
  );

  if (!source.includes("async function queueRemovedTeamNotice(input: {")) {
    const anchor = "\nexport async function POST(request: Request) {";
    if (!source.includes(anchor)) {
      throw new Error(
        "Removed-team fixture notice: POST handler anchor was not found.",
      );
    }

    const helper = `
async function queueRemovedTeamNotice(input: {
  fixtureId: string;
  teamId: string;
  previousFixtureLabel: string;
  previousFixtureSummary: string;
  previousKickoffAt: Date;
  leagueId: string;
  leagueLabel: string;
  sourceType: string;
  sourceId: string;
}) {
  const { recipient, snapshot } = await upsertTeamNotificationRecipient(
    input.teamId,
  );
  const contactName = snapshot.primaryContact.name ?? snapshot.teamName;
  const fixturesUrl = buildCaptainFixturesUrl(input.teamId);
  const emailBody = [
    \`Hi \${contactName},\`,
    "",
    "IMPORTANT: your team is no longer playing in the fixture below.",
    "",
    "Previous fixture — this no longer applies to your team:",
    input.previousFixtureSummary,
    "",
    \`The revised fixture does not involve \${snapshot.teamName}. You do not need to attend it or confirm it.\`,
    "",
    "If SIXFL has arranged a replacement fixture for your team, you will receive the correct details and confirmation link separately. Your current published fixtures are also available using the button below.",
    "",
    "{{cta}}",
    "",
    "If you believe your team should still be in the original fixture, please contact SIXFL directly.",
  ].join("\\n");

  const emailDispatch = await queueDirectNotification({
    recipientId: recipient.id,
    channel: NotificationChannel.EMAIL,
    audience: NotificationAudience.TEAM,
    subject: \`SIXFL fixture change: \${snapshot.teamName} is no longer in \${input.previousFixtureLabel}\`,
    body: emailBody,
    isTransactional: true,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    emailCta: { label: "View my fixtures", url: fixturesUrl },
    metadata: {
      fixtureId: input.fixtureId,
      teamId: input.teamId,
      leagueId: input.leagueId,
      leagueLabel: input.leagueLabel,
      notificationKind: "TEAM_REMOVED_FROM_FIXTURE",
      previousFixtureLabel: input.previousFixtureLabel,
    },
  });

  const smsDispatch = await queueDirectNotification({
    recipientId: recipient.id,
    channel: NotificationChannel.SMS,
    audience: NotificationAudience.TEAM,
    body: \`SIXFL: \${snapshot.teamName} is no longer playing \${input.previousFixtureLabel} (\${formatKickoff(input.previousKickoffAt)}). The revised fixture does not involve your team, so do not attend or confirm it. Check your fixtures: \${fixturesUrl}\`,
    isTransactional: true,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    metadata: {
      fixtureId: input.fixtureId,
      teamId: input.teamId,
      leagueId: input.leagueId,
      leagueLabel: input.leagueLabel,
      notificationKind: "TEAM_REMOVED_FROM_FIXTURE",
      previousFixtureLabel: input.previousFixtureLabel,
    },
  });

  return (
    Number(emailDispatch.status === NotificationDispatchStatus.QUEUED) +
    Number(smsDispatch.status === NotificationDispatchStatus.QUEUED)
  );
}
`;

    source = source.replace(anchor, `${helper}${anchor}`);
    changed = true;
  }

  if (!source.includes("async function queueOpponentChangedNotice(input: {")) {
    const anchor = "\nexport async function POST(request: Request) {";
    if (!source.includes(anchor)) {
      throw new Error(
        "Opponent-change fixture notice: POST handler anchor was not found.",
      );
    }

    const helper = `
async function queueOpponentChangedNotice(input: {
  fixtureId: string;
  teamId: string;
  previousOpponentName: string;
  nextOpponentName: string;
  nextFixtureSummary: string;
  leagueId: string;
  leagueLabel: string;
  sourceId: string;
}) {
  const { recipient, snapshot } = await upsertTeamNotificationRecipient(
    input.teamId,
  );
  const contactName = snapshot.primaryContact.name ?? snapshot.teamName;
  const dashboardUrl = buildCaptainFixturesUrl(input.teamId, input.fixtureId);
  const emailBody = [
    \`Hi \${contactName},\`,
    "",
    \`Your opposition has changed from \${input.previousOpponentName} to \${input.nextOpponentName}.\`,
    "",
    "Your kick-off time, venue and fixture status are unchanged, so your existing confirmation still stands. You do not need to reconfirm.",
    "",
    "Updated fixture:",
    input.nextFixtureSummary,
    "",
    "{{cta}}",
    "",
    "If the new opposition creates a problem for your team, please contact SIXFL directly so we can manage it.",
  ].join("\\n");

  const emailDispatch = await queueDirectNotification({
    recipientId: recipient.id,
    channel: NotificationChannel.EMAIL,
    audience: NotificationAudience.TEAM,
    subject: \`SIXFL fixture update: your opposition is now \${input.nextOpponentName}\`,
    body: emailBody,
    isTransactional: true,
    sourceType: OPPONENT_CHANGED_SOURCE_TYPE,
    sourceId: \`\${input.sourceId}:\${input.teamId}\`,
    emailCta: { label: "View fixture", url: dashboardUrl },
    metadata: {
      fixtureId: input.fixtureId,
      teamId: input.teamId,
      leagueId: input.leagueId,
      leagueLabel: input.leagueLabel,
      notificationKind: "OPPONENT_CHANGED_NO_RECONFIRMATION",
      previousOpponentName: input.previousOpponentName,
      nextOpponentName: input.nextOpponentName,
    },
  });

  return Number(emailDispatch.status === NotificationDispatchStatus.QUEUED);
}
`;

    source = source.replace(anchor, `${helper}${anchor}`);
    changed = true;
  }

  replaceOnce(
    "  const affectedTeamIds = Array.from(new Set([fixture.homeTeamId, fixture.awayTeamId, homeTeamId, awayTeamId]));",
    [
      "  const previousTeamIds = new Set([",
      "    fixture.homeTeamId,",
      "    fixture.awayTeamId,",
      "  ]);",
      "  const nextParticipantTeamIds = Array.from(",
      "    new Set([homeTeamId, awayTeamId]),",
      "  );",
      "  const nextTeamIds = new Set(nextParticipantTeamIds);",
      "  const removedTeamIds = new Set(",
      "    Array.from(previousTeamIds).filter(",
      "      (teamId) => !nextTeamIds.has(teamId),",
      "    ),",
      "  );",
      "  const retainedTeamIds = Array.from(previousTeamIds).filter((teamId) =>",
      "    nextTeamIds.has(teamId),",
      "  );",
      "  const scheduledNoticeTeamIds = [",
      "    ...Array.from(removedTeamIds),",
      "    ...retainedTeamIds,",
      "  ];",
      "  const affectedTeamIds = Array.from(",
      "    new Set([",
      "      ...Array.from(previousTeamIds),",
      "      ...nextParticipantTeamIds,",
      "    ]),",
      "  );",
      "  const teamFacingDetailsChanged =",
      "    fixture.kickoffAt.getTime() !== nextKickoffAt.getTime() ||",
      "    fixture.venueId !== venueId ||",
      "    valuesDiffer(fixture.venue?.name ?? null, nextVenue?.name ?? null) ||",
      "    fixture.status !== status;",
    ].join("\n"),
    "old/new team classification",
  );

  replaceOnce(
    [
      "  const leagueLabel = `${league.name}${league.season ? ` · ${league.season}` : \"\"}`;",
      "  const newFixtureSummary = describeFixture({",
    ].join("\n"),
    [
      "  const leagueLabel = `${league.name}${league.season ? ` · ${league.season}` : \"\"}`;",
      "  const previousFixtureLabel = `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`;",
      "  const previousFixtureSummary = describeFixture({",
      "    homeTeamName: fixture.homeTeam.name,",
      "    awayTeamName: fixture.awayTeam.name,",
      "    kickoffAt: fixture.kickoffAt,",
      "    venueName: fixture.venue?.name ?? null,",
      "    pitch: fixture.pitch,",
      "    status: fixture.status,",
      "  });",
      "  const newFixtureSummary = describeFixture({",
    ].join("\n"),
    "previous fixture summary",
  );

  const oldConfirmationTeamFilter =
    "teamId: { in: affectedTeamIds },";
  const newConfirmationTeamFilter =
    "teamId: { in: nextParticipantTeamIds },";
  const oldFilterCount = countOccurrences(source, oldConfirmationTeamFilter);
  const newFilterCount = countOccurrences(source, newConfirmationTeamFilter);

  if (oldFilterCount > 0) {
    source = source.split(oldConfirmationTeamFilter).join(newConfirmationTeamFilter);
    changed = true;
  } else if (newFilterCount === 0 && !source.includes("teamFacingDetailsChanged ? retainedTeamIds : []")) {
    throw new Error(
      "Removed-team fixture notice could not find a confirmation-team filter to protect.",
    );
  }

  const scheduledBranchStart = source.indexOf(
    "  if (!shouldSendReconfirmNoticeForStatus(status)) {",
  );
  if (scheduledBranchStart < 0) {
    throw new Error(
      "Opponent-change fixture notice could not find the scheduled change branch.",
    );
  }

  const scheduledResetFilter =
    "teamId: { in: nextParticipantTeamIds },";
  const preservedResetFilter =
    "teamId: { in: teamFacingDetailsChanged ? retainedTeamIds : [] },";
  if (!source.includes(preservedResetFilter)) {
    const scheduledResetPosition = source.indexOf(
      scheduledResetFilter,
      scheduledBranchStart,
    );
    if (scheduledResetPosition < 0) {
      throw new Error(
        "Opponent-change fixture notice could not find the scheduled confirmation reset filter.",
      );
    }
    source =
      source.slice(0, scheduledResetPosition) +
      preservedResetFilter +
      source.slice(scheduledResetPosition + scheduledResetFilter.length);
    changed = true;
  }

  replaceOnce(
    [
      "    for (const teamId of affectedTeamIds) {",
      "      const { recipient, snapshot } = await upsertTeamNotificationRecipient(teamId);",
    ].join("\n"),
    [
      "    for (const teamId of affectedTeamIds) {",
      "      if (removedTeamIds.has(teamId)) {",
      "        queued += await queueRemovedTeamNotice({",
      "          fixtureId: fixture.id,",
      "          teamId,",
      "          previousFixtureLabel,",
      "          previousFixtureSummary,",
      "          previousKickoffAt: fixture.kickoffAt,",
      "          leagueId,",
      "          leagueLabel,",
      "          sourceType: STATUS_SOURCE_TYPE,",
      "          sourceId,",
      "        });",
      "        continue;",
      "      }",
      "",
      "      const { recipient, snapshot } = await upsertTeamNotificationRecipient(teamId);",
    ].join("\n"),
    "removed team handling for cancelled or postponed fixtures",
  );

  replaceOnce(
    [
      "  for (const teamId of affectedTeamIds) {",
      "    const { recipient, snapshot } = await upsertTeamNotificationRecipient(teamId);",
    ].join("\n"),
    [
      "  for (const teamId of scheduledNoticeTeamIds) {",
      "    if (removedTeamIds.has(teamId)) {",
      "      queued += await queueRemovedTeamNotice({",
      "        fixtureId: fixture.id,",
      "        teamId,",
      "        previousFixtureLabel,",
      "        previousFixtureSummary,",
      "        previousKickoffAt: fixture.kickoffAt,",
      "        leagueId,",
      "        leagueLabel,",
      "        sourceType: RECONFIRM_SOURCE_TYPE,",
      "        sourceId,",
      "      });",
      "      continue;",
      "    }",
      "",
      "    if (!teamFacingDetailsChanged) {",
      "      const previousOpponent =",
      "        teamId === fixture.homeTeamId ? fixture.awayTeam : fixture.homeTeam;",
      "      const nextOpponent =",
      "        teamId === homeTeamId ? nextAwayTeam : nextHomeTeam;",
      "",
      "      if (previousOpponent.id !== nextOpponent.id) {",
      "        queued += await queueOpponentChangedNotice({",
      "          fixtureId: fixture.id,",
      "          teamId,",
      "          previousOpponentName: previousOpponent.name,",
      "          nextOpponentName: nextOpponent.name,",
      "          nextFixtureSummary: newFixtureSummary,",
      "          leagueId,",
      "          leagueLabel,",
      "          sourceId,",
      "        });",
      "      }",
      "      continue;",
      "    }",
      "",
      "    const { recipient, snapshot } = await upsertTeamNotificationRecipient(teamId);",
    ].join("\n"),
    "removed and retained team handling for scheduled fixture changes",
  );

  const required = [
    'const OPPONENT_CHANGED_SOURCE_TYPE = "FIXTURE_OPPONENT_CHANGED_NOTICE";',
    "function buildCaptainFixturesUrl(teamId: string, fixtureId?: string)",
    "async function queueRemovedTeamNotice(input: {",
    "async function queueOpponentChangedNotice(input: {",
    "IMPORTANT: your team is no longer playing in the fixture below.",
    "The revised fixture does not involve",
    "You do not need to attend it or confirm it.",
    "Your opposition has changed from",
    "your existing confirmation still stands. You do not need to reconfirm.",
    'emailCta: { label: "View my fixtures", url: fixturesUrl }',
    'notificationKind: "TEAM_REMOVED_FROM_FIXTURE"',
    'notificationKind: "OPPONENT_CHANGED_NO_RECONFIRMATION"',
    "const removedTeamIds = new Set(",
    "const scheduledNoticeTeamIds = [",
    "const teamFacingDetailsChanged =",
    "teamId: { in: nextParticipantTeamIds },",
    "teamId: { in: teamFacingDetailsChanged ? retainedTeamIds : [] },",
    "for (const teamId of scheduledNoticeTeamIds) {",
    "if (!teamFacingDetailsChanged) {",
    "sourceType: STATUS_SOURCE_TYPE,",
    "sourceType: RECONFIRM_SOURCE_TYPE,",
    "sourceType: OPPONENT_CHANGED_SOURCE_TYPE,",
  ];

  for (const token of required) {
    if (!source.includes(token)) {
      throw new Error(
        `Removed-team fixture notice is missing required safeguard: ${token}`,
      );
    }
  }

  if (countOccurrences(source, "if (removedTeamIds.has(teamId)) {") !== 2) {
    throw new Error(
      "Removed-team fixture notice must protect both status and scheduled change emails.",
    );
  }

  const opponentHelperStart = source.indexOf(
    "async function queueOpponentChangedNotice(input: {",
  );
  const postHandlerStart = source.indexOf("\nexport async function POST(request: Request) {");
  const opponentHelper =
    opponentHelperStart >= 0 && postHandlerStart > opponentHelperStart
      ? source.slice(opponentHelperStart, postHandlerStart)
      : "";
  if (!opponentHelper || opponentHelper.includes("NotificationChannel.SMS")) {
    throw new Error(
      "Opposition-only fixture changes must send the retained team email only, not an SMS or reconfirmation request.",
    );
  }

  const scheduledBranch = source.slice(scheduledBranchStart);
  if (scheduledBranch.includes("for (const teamId of affectedTeamIds) {")) {
    throw new Error(
      "Newly added teams must not receive the pre-save generic update email; the saved fixture action sends their correct confirmation instead.",
    );
  }

  if (changed) {
    fs.writeFileSync(routePath, source, "utf8");
  }

  return changed;
}

const firstPassChanged = applyPatch();
const secondPassChanged = applyPatch();

if (secondPassChanged) {
  throw new Error("Removed-team fixture notice patch is not idempotent.");
}

console.log(
  firstPassChanged
    ? "Added clear team-change notices while preserving retained confirmations for opposition-only changes."
    : "Fixture team-change notice safeguards already applied.",
);