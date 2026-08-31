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
    "        teamId: { in: affectedTeamIds },";
  const newConfirmationTeamFilter =
    "        teamId: { in: nextParticipantTeamIds },";
  const oldFilterCount = countOccurrences(source, oldConfirmationTeamFilter);
  const newFilterCount = countOccurrences(source, newConfirmationTeamFilter);

  if (oldFilterCount > 0) {
    source = source.split(oldConfirmationTeamFilter).join(newConfirmationTeamFilter);
    changed = true;
  } else if (newFilterCount === 0) {
    throw new Error(
      "Removed-team fixture notice could not find a confirmation-team filter to protect.",
    );
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
      "    const { recipient, snapshot } = await upsertTeamNotificationRecipient(teamId);",
    ].join("\n"),
    "removed team handling for scheduled fixture changes",
  );

  const required = [
    "function buildCaptainFixturesUrl(teamId: string, fixtureId?: string)",
    "async function queueRemovedTeamNotice(input: {",
    "IMPORTANT: your team is no longer playing in the fixture below.",
    "The revised fixture does not involve",
    "You do not need to attend it or confirm it.",
    'emailCta: { label: "View my fixtures", url: fixturesUrl }',
    'notificationKind: "TEAM_REMOVED_FROM_FIXTURE"',
    "const removedTeamIds = new Set(",
    "const scheduledNoticeTeamIds = [",
    "teamId: { in: nextParticipantTeamIds },",
    "for (const teamId of scheduledNoticeTeamIds) {",
    "sourceType: STATUS_SOURCE_TYPE,",
    "sourceType: RECONFIRM_SOURCE_TYPE,",
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

  const scheduledBranchStart = source.indexOf(
    "  if (!shouldSendReconfirmNoticeForStatus(status)) {",
  );
  const scheduledBranch =
    scheduledBranchStart >= 0 ? source.slice(scheduledBranchStart) : "";
  if (
    !scheduledBranch ||
    scheduledBranch.includes("for (const teamId of affectedTeamIds) {")
  ) {
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
    ? "Added clear removed-team fixture notices and stopped irrelevant confirmation links."
    : "Removed-team fixture notice safeguards already applied.",
);
