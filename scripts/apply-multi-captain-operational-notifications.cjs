const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, source) {
  fs.writeFileSync(path.join(root, relativePath), source, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Multi-captain ${label} anchor not found.`);
  return source.replace(before, after);
}

function replaceRange(source, startMarker, endMarker, replacement, label) {
  if (source.includes(replacement)) return source;
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Multi-captain ${label} start anchor not found.`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`Multi-captain ${label} end anchor not found.`);
  return source.slice(0, start) + replacement + source.slice(end + endMarker.length);
}

// ---------------------------------------------------------------------------
// Existing Night Board fan-out: important fixture changes go to every captain.
// ---------------------------------------------------------------------------
const nightBoardPath = "src/lib/fixtures/night-board-change-notifications.ts";
let nightBoard = read(nightBoardPath);
const nightImportAnchor = 'import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";';
const nightImportLine = 'import { upsertAdditionalCaptainOperationalRecipients } from "@/lib/notifications/team-operational-recipients";';
if (!nightBoard.includes(nightImportLine)) {
  if (!nightBoard.includes(nightImportAnchor)) throw new Error("Multi-captain Night Board import anchor not found.");
  nightBoard = nightBoard.replace(nightImportAnchor, `${nightImportAnchor}\n${nightImportLine}`);
}
const nightMarker = "      const additionalCaptainRecipients = await upsertAdditionalCaptainOperationalRecipients({";
if (!nightBoard.includes(nightMarker)) {
  const closingAnchor = `      );\n    }\n  }\n\n  const kickoffChanged =`;
  if (!nightBoard.includes(closingAnchor)) throw new Error("Multi-captain Night Board team-loop anchor not found.");
  const addition = `      );\n\n      const additionalCaptainRecipients = await upsertAdditionalCaptainOperationalRecipients({\n        teamId,\n        excludeEmail: recipient.email,\n        excludePhone: recipient.phone,\n      });\n\n      for (const captainRecipient of additionalCaptainRecipients) {\n        recordOutcome(\n          team,\n          NotificationChannel.EMAIL,\n          await queueOnce({\n            recipientId: captainRecipient.id,\n            channel: NotificationChannel.EMAIL,\n            audience: NotificationAudience.TEAM,\n            subject: emailCopy.subject,\n            body: emailCopy.body,\n            sourceType,\n            sourceId,\n            metadata: { ...metadata, operationalCaptainCopy: true },\n            emailBranding: {\n              teamName: currentTeam.name,\n              teamLogoUrl: currentTeam.logoUrl,\n              leagueName: brandingLeague,\n            },\n            emailCta: { label: emailCopy.ctaLabel, url: dashboardUrl },\n            createdByUserId: input.createdByUserId,\n          }),\n        );\n\n        recordOutcome(\n          team,\n          NotificationChannel.SMS,\n          await queueOnce({\n            recipientId: captainRecipient.id,\n            channel: NotificationChannel.SMS,\n            audience: NotificationAudience.TEAM,\n            body: teamSmsCopy({\n              status: input.after.status,\n              homeTeamName: input.homeTeam.name,\n              awayTeamName: input.awayTeam.name,\n              after: input.after,\n              dashboardUrl,\n            }),\n            sourceType,\n            sourceId,\n            metadata: { ...metadata, operationalCaptainCopy: true },\n            createdByUserId: input.createdByUserId,\n          }),\n        );\n      }\n    }\n  }\n\n  const kickoffChanged =`;
  nightBoard = nightBoard.replace(closingAnchor, addition);
}
if (!nightBoard.includes(nightImportLine) || !nightBoard.includes(nightMarker)) {
  throw new Error("Multi-captain Night Board notification patch did not apply completely.");
}
write(nightBoardPath, nightBoard);

// ---------------------------------------------------------------------------
// Captain phone sync: when a known team/lead number matches one captain email
// unambiguously, expose it through that captain's member profile. Never replace
// a member phone that is already saved.
// ---------------------------------------------------------------------------
const contactsPath = "src/lib/notifications/team-contacts.ts";
let contacts = read(contactsPath);
const phoneSyncImport = 'import { syncTeamCaptainPhonesFromKnownContacts } from "@/lib/notifications/team-captain-contact-sync";';
if (!contacts.includes(phoneSyncImport)) {
  const anchor = '} from "@/lib/notifications/phone";';
  if (!contacts.includes(anchor)) throw new Error("Multi-captain team-contact import anchor not found.");
  contacts = contacts.replace(anchor, `${anchor}\n${phoneSyncImport}`);
}
if (!contacts.includes("const { profiles: captainProfiles } =")) {
  const anchor = `  if (!team) {\n    return null;\n  }\n\n`;
  if (!contacts.includes(anchor)) throw new Error("Multi-captain team-contact sync anchor not found.");
  contacts = contacts.replace(anchor, `${anchor}  const { profiles: captainProfiles } =\n    await syncTeamCaptainPhonesFromKnownContacts(team.id);\n\n`);
}
if (!contacts.includes("const memberPhone = displayPhone(captainProfiles.get(member.id)?.phone);")) {
  contacts = replaceRequired(
    contacts,
    `  for (const member of team.members) {\n    const key = contactKey({\n      name: member.user.name,\n      email: member.user.email,\n      source: \`member:\${member.id}\`,\n    });`,
    `  for (const member of team.members) {\n    const memberPhone = displayPhone(captainProfiles.get(member.id)?.phone);\n    const key = contactKey({\n      name: member.user.name,\n      email: member.user.email,\n      phone: memberPhone,\n      source: \`member:\${member.id}\`,\n    });`,
    "team-contact member phone",
  );
  contacts = replaceRequired(
    contacts,
    `      email: cleanValue(member.user.email),\n      phone: null,\n      isPrimary: contacts.length === 0,`,
    `      email: cleanValue(member.user.email),\n      phone: memberPhone,\n      isPrimary: contacts.length === 0,`,
    "team-contact member phone display",
  );
}
write(contactsPath, contacts);

// ---------------------------------------------------------------------------
// Confirmation emails: dedupe by email but fan initial and automatic requests
// out to every captain. Delivery history is checked per recipient, so adding a
// second captain later backfills only that captain rather than resending all.
// ---------------------------------------------------------------------------
const emailPath = "src/lib/fixtures/confirmation-emails.ts";
let email = read(emailPath);
email = replaceRequired(
  email,
  'import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";',
  'import { upsertTeamOperationalEmailRecipients } from "@/lib/notifications/team-operational-recipients";',
  "confirmation-email import",
);
if (!email.includes("recipientId: string;\n}")) {
  email = replaceRequired(
    email,
    `async function hasDispatch(input: {\n  sourceType: string;\n  sourceId: string;\n}) {`,
    `async function hasDispatch(input: {\n  sourceType: string;\n  sourceId: string;\n  recipientId: string;\n}) {`,
    "confirmation-email dispatch signature",
  );
  email = replaceRequired(
    email,
    `      sourceType: input.sourceType,\n      sourceId: input.sourceId,\n      status: {`,
    `      sourceType: input.sourceType,\n      sourceId: input.sourceId,\n      recipientId: input.recipientId,\n      status: {`,
    "confirmation-email dispatch recipient filter",
  );
}

const initialStart = `  const sourceId = \`\${fixture.id}:\${input.teamId}\`;\n  const sourceType = getSourceType("initial");`;
const initialEnd = `  return "queued";`;
const initialReplacement = `  const sourceId = \`\${fixture.id}:\${input.teamId}\`;\n  const sourceType = getSourceType("initial");\n  const team =\n    fixture.homeTeam.id === input.teamId ? fixture.homeTeam : fixture.awayTeam;\n  const opponent =\n    fixture.homeTeam.id === input.teamId ? fixture.awayTeam : fixture.homeTeam;\n  const recipients = await upsertTeamOperationalEmailRecipients(input.teamId);\n  const emailRecipients = recipients.filter((recipient) => recipient.email?.trim());\n  if (emailRecipients.length === 0) return "no-email";\n\n  const captainFixturesUrl = new URL(\n    \`/captain/team/\${input.teamId}/fixtures?fixtureId=\${encodeURIComponent(fixture.id)}\`,\n    getSiteUrl(),\n  ).toString();\n  const copy = getEmailCopy({\n    mode: "initial",\n    teamName: team.name,\n    opponentName: opponent.name,\n    kickoffAt: fixture.kickoffAt,\n  });\n\n  let queued = 0;\n  let alreadySent = 0;\n  for (const recipient of emailRecipients) {\n    if (await hasDispatch({ sourceType, sourceId, recipientId: recipient.id })) {\n      alreadySent += 1;\n      continue;\n    }\n\n    const dispatch = await queueDirectNotification({\n      recipientId: recipient.id,\n      channel: NotificationChannel.EMAIL,\n      audience: NotificationAudience.TEAM,\n      subject: copy.subject,\n      body: copy.body,\n      isTransactional: true,\n      sourceType,\n      sourceId,\n      emailBranding: {\n        teamName: team.name,\n        teamLogoUrl: team.logoUrl ?? null,\n        leagueName: fixture.league.season\n          ? \`\${fixture.league.name} — \${fixture.league.season}\`\n          : fixture.league.name,\n      },\n      emailCta: {\n        label: "Confirm team availability",\n        url: captainFixturesUrl,\n      },\n      metadata: {\n        kind: "fixture_confirmation_email",\n        mode: "initial",\n        trigger: "published_fixture_team_added",\n        fixtureId: fixture.id,\n        leagueId: fixture.leagueId,\n        teamId: input.teamId,\n        teamName: team.name,\n        opponentName: opponent.name,\n        operationalCaptainCopy: true,\n      },\n    });\n    if (dispatch.status === NotificationDispatchStatus.QUEUED) queued += 1;\n  }\n\n  if (queued === 0) return alreadySent > 0 ? "already-sent" : "skipped";\n\n  await prisma.fixtureCaptainConfirmation.upsert({\n    where: {\n      fixtureId_teamId: {\n        fixtureId: fixture.id,\n        teamId: input.teamId,\n      },\n    },\n    update: {\n      status: FixtureCaptainConfirmationStatus.PENDING,\n      lastChasedAt: new Date(),\n    },\n    create: {\n      fixtureId: fixture.id,\n      teamId: input.teamId,\n      status: FixtureCaptainConfirmationStatus.PENDING,\n      lastChasedAt: new Date(),\n    },\n  });\n\n  return "queued";`;
if (!email.includes("operationalCaptainCopy: true")) {
  email = replaceRange(email, initialStart, initialEnd, initialReplacement, "initial confirmation-email fan-out");
}

const autoStart = `      const team = fixture.homeTeam.id === teamId ? fixture.homeTeam : fixture.awayTeam;`;
const autoEnd = `      summary.queued += 1;`;
const autoReplacement = `      const team = fixture.homeTeam.id === teamId ? fixture.homeTeam : fixture.awayTeam;\n      const opponent = fixture.homeTeam.id === teamId ? fixture.awayTeam : fixture.homeTeam;\n      const sourceId = \`\${fixture.id}:\${teamId}\`;\n      const recipients = await upsertTeamOperationalEmailRecipients(teamId);\n      const emailRecipients = recipients.filter((recipient) => recipient.email?.trim());\n      if (emailRecipients.length === 0) {\n        summary.noEmail += 1;\n        continue;\n      }\n\n      const captainFixturesUrl = new URL(\n        \`/captain/team/\${teamId}/fixtures?fixtureId=\${encodeURIComponent(fixture.id)}\`,\n        getSiteUrl(),\n      ).toString();\n      let queuedForTeam = 0;\n\n      for (const recipient of emailRecipients) {\n        const initialSourceType = getSourceType("initial");\n        const initialAlreadySent = await hasDispatch({\n          sourceType: initialSourceType,\n          sourceId,\n          recipientId: recipient.id,\n        });\n\n        let mode: ConfirmationEmailMode | null = null;\n        if (!initialAlreadySent) {\n          mode = "initial";\n        } else if (fixture.kickoffAt <= urgentCutoff) {\n          const sourceType = getSourceType("auto24h");\n          if (!(await hasDispatch({ sourceType, sourceId, recipientId: recipient.id }))) mode = "auto24h";\n        } else if (fixture.kickoffAt <= standardCutoff) {\n          const sourceType = getSourceType("auto72h");\n          if (!(await hasDispatch({ sourceType, sourceId, recipientId: recipient.id }))) mode = "auto72h";\n        }\n\n        if (!mode) {\n          summary.alreadySent += 1;\n          continue;\n        }\n\n        const copy = getEmailCopy({ mode, teamName: team.name, opponentName: opponent.name, kickoffAt: fixture.kickoffAt });\n        const dispatch = await queueDirectNotification({\n          recipientId: recipient.id,\n          channel: NotificationChannel.EMAIL,\n          audience: NotificationAudience.TEAM,\n          subject: copy.subject,\n          body: copy.body,\n          isTransactional: true,\n          sourceType: getSourceType(mode),\n          sourceId,\n          emailBranding: {\n            teamName: team.name,\n            teamLogoUrl: team.logoUrl ?? null,\n            leagueName: fixture.league.season ? \`\${fixture.league.name} — \${fixture.league.season}\` : fixture.league.name,\n          },\n          emailCta: { label: mode === "initial" ? "Confirm team availability" : "Open fixture details", url: captainFixturesUrl },\n          metadata: {\n            kind: "fixture_confirmation_email", mode, fixtureId: fixture.id, leagueId: fixture.leagueId, teamId,\n            teamName: team.name, opponentName: opponent.name, operationalCaptainCopy: true,\n          },\n        });\n        if (dispatch.status === NotificationDispatchStatus.QUEUED) {\n          queuedForTeam += 1;\n          summary.queued += 1;\n        } else {\n          summary.skipped += 1;\n        }\n      }\n\n      if (queuedForTeam > 0) {\n        await prisma.fixtureCaptainConfirmation.upsert({\n          where: { fixtureId_teamId: { fixtureId: fixture.id, teamId } },\n          update: { lastChasedAt: new Date() },\n          create: { fixtureId: fixture.id, teamId, status: FixtureCaptainConfirmationStatus.PENDING, lastChasedAt: new Date() },\n        });\n      }`;
if (!email.includes("const recipients = await upsertTeamOperationalEmailRecipients(teamId);")) {
  email = replaceRange(email, autoStart, autoEnd, autoReplacement, "automatic confirmation-email fan-out");
}
write(emailPath, email);

// ---------------------------------------------------------------------------
// Confirmation SMS: same rule, deduplicated by phone and delivery history per
// recipient. Existing last-minute replacement suppression remains untouched.
// ---------------------------------------------------------------------------
const smsPath = "src/lib/fixtures/confirmation-reminders.ts";
let sms = read(smsPath);
sms = replaceRequired(
  sms,
  'import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";',
  'import { upsertTeamOperationalSmsRecipients } from "@/lib/notifications/team-operational-recipients";',
  "confirmation-SMS import",
);
if (!sms.includes("recipientId: true,")) {
  sms = replaceRequired(
    sms,
    `    select: {\n      id: true,\n      status: true,\n      createdAt: true,\n    },`,
    `    select: {\n      id: true,\n      recipientId: true,\n      status: true,\n      createdAt: true,\n    },`,
    "confirmation-SMS dispatch recipient selection",
  );
}
const smsStart = `  const activeExistingDispatch = existingDispatches.find((dispatch) => {`;
const smsEnd = `  return { ok: true, status: "queued", teamName: team.name };`;
const smsReplacement = `  const recipients = await upsertTeamOperationalSmsRecipients(input.teamId);\n  const smsRecipients = recipients.filter((recipient) => recipient.phone?.trim());\n  if (smsRecipients.length === 0) {\n    return { ok: false, status: "no_phone", teamName: team.name };\n  }\n\n  const captainFixturesUrl = buildAbsoluteUrl(\n    \`/captain/team/\${input.teamId}/fixtures?fixtureId=\${encodeURIComponent(fixture.id)}\`,\n  );\n  const smsBody = await buildSmsBody({\n    mode: input.mode,\n    teamName: team.name,\n    opponentName: opponent.name,\n    kickoffAt: fixture.kickoffAt,\n    captainFixturesUrl,\n  });\n  if (!smsBody) return { ok: false, status: "template_missing", teamName: team.name };\n\n  let queued = 0;\n  let alreadySent = 0;\n  for (const recipient of smsRecipients) {\n    const activeExistingDispatch = existingDispatches.find((dispatch) => {\n      if (dispatch.recipientId !== recipient.id) return false;\n      if (staleQueuedDispatchIds.includes(dispatch.id)) return false;\n      return fixture.updatedAt.getTime() <= dispatch.createdAt.getTime();\n    });\n    if (activeExistingDispatch) {\n      alreadySent += 1;\n      continue;\n    }\n\n    const dispatch = await queueDirectNotification({\n      recipientId: recipient.id,\n      channel: NotificationChannel.SMS,\n      audience: NotificationAudience.TEAM,\n      body: smsBody,\n      isTransactional: true,\n      sourceType,\n      sourceId,\n      metadata: {\n        kind: "fixture_confirmation_sms", mode: input.mode, fixtureId: fixture.id, leagueId: fixture.leagueId,\n        teamId: input.teamId, teamName: team.name, opponentName: opponent.name, templateKey: getTemplateKey(input.mode),\n        operationalCaptainCopy: true,\n      },\n    });\n    if (dispatch.status === NotificationDispatchStatus.QUEUED) queued += 1;\n  }\n\n  if (queued > 0) {\n    await prisma.fixtureCaptainConfirmation.upsert({\n      where: { fixtureId_teamId: { fixtureId: fixture.id, teamId: input.teamId } },\n      update: { lastChasedAt: new Date() },\n      create: { fixtureId: fixture.id, teamId: input.teamId, status: FixtureCaptainConfirmationStatus.PENDING, lastChasedAt: new Date() },\n    });\n    return { ok: true, status: "queued", teamName: team.name };\n  }\n  if (alreadySent > 0) return { ok: true, status: "already_sent", teamName: team.name };\n  return { ok: false, status: "skipped", teamName: team.name };`;
if (!sms.includes("const recipients = await upsertTeamOperationalSmsRecipients(input.teamId);")) {
  sms = replaceRange(sms, smsStart, smsEnd, smsReplacement, "confirmation-SMS fan-out");
}
write(smsPath, sms);

if (!email.includes("upsertTeamOperationalEmailRecipients") || !sms.includes("upsertTeamOperationalSmsRecipients")) {
  throw new Error("Multi-captain fixture confirmation patch did not apply completely.");
}

console.log("Important Night Board updates and fixture confirmations now fan out to all captains.");
