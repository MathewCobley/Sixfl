const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function absolute(filePath) {
  return path.join(root, filePath);
}

function read(filePath) {
  return fs.readFileSync(absolute(filePath), "utf8");
}

function write(filePath, source) {
  fs.writeFileSync(absolute(filePath), source, "utf8");
}

function replaceOnce(filePath, before, after, label) {
  let source = read(filePath);
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in ${filePath}`);
  }
  source = source.replace(before, after);
  write(filePath, source);
}

function replaceWithin(filePath, marker, before, after, label) {
  let source = read(filePath);
  if (source.includes(after)) return;

  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error(`Expected marker for ${label} was not found in ${filePath}`);
  }

  const beforeIndex = source.indexOf(before, markerIndex);
  if (beforeIndex < 0) {
    throw new Error(`Expected ${label} source was not found after its marker in ${filePath}`);
  }

  source =
    source.slice(0, beforeIndex) +
    after +
    source.slice(beforeIndex + before.length);
  write(filePath, source);
}

const availabilityActions =
  "src/app/captain/team/[teamid]/availability/actions.ts";
const availabilityPage =
  "src/app/captain/team/[teamid]/availability/page.tsx";
const dispatchLogger = "src/lib/communications/log-dispatch.ts";
const messagingService = "src/lib/messaging/service.ts";
const messagingPage = "src/app/(admin)/admin/messaging/page.tsx";
const inboxComponent = "src/components/admin/messages/AdminMessagesInbox.tsx";
const threadComponent = "src/components/admin/messages/AdminMessageThread.tsx";

// The availability screen used to include SCHEDULED fixtures from the previous
// 30 days. That made an old fixture look chaseable and allowed a user-triggered
// SMS to be sent after the match date. Show only future scheduled fixtures,
// while retaining recently postponed fixtures so they can still be reset.
replaceOnce(
  availabilityPage,
  [
    "  const since = new Date();",
    "  since.setDate(since.getDate() - 30);",
    "",
    "  const fixtures = await prisma.fixture.findMany({",
    "    where: {",
    "      ...publishedFixtureWhere,",
    "      OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],",
    "      kickoffAt: { gte: since },",
    '      status: { in: ["SCHEDULED", "POSTPONED"] },',
    "    },",
  ].join("\n"),
  [
    "  const now = new Date();",
    "  const since = new Date(now);",
    "  since.setDate(since.getDate() - 30);",
    "",
    "  const fixtures = await prisma.fixture.findMany({",
    "    where: {",
    "      ...publishedFixtureWhere,",
    "      AND: [",
    "        { OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }] },",
    "        {",
    "          OR: [",
    '            { status: "SCHEDULED", kickoffAt: { gt: now } },',
    '            { status: "POSTPONED", kickoffAt: { gte: since } },',
    "          ],",
    "        },",
    "      ],",
    "    },",
  ].join("\n"),
  "future-only scheduled availability fixtures",
);

replaceOnce(
  availabilityPage,
  [
    "          const noResponseCount = fixtureResponses.filter(",
    '            (response) => response === "NO_RESPONSE",',
    "          ).length;",
    "",
    "          return (",
  ].join("\n"),
  [
    "          const noResponseCount = fixtureResponses.filter(",
    '            (response) => response === "NO_RESPONSE",',
    "          ).length;",
    "          const fixtureCanBeChased =",
    '            fixture.status === "SCHEDULED" &&',
    "            fixture.kickoffAt.getTime() > now.getTime();",
    "",
    "          return (",
  ].join("\n"),
  "fixture chase eligibility calculation",
);

replaceOnce(
  availabilityPage,
  [
    "                  const smsDispatch = smsDispatchBySourceId.get(",
    "                    getSmsSourceId({",
    "                      fixtureId: fixture.id,",
    "                      teamMemberId: member.id,",
    "                    }),",
    "                  );",
    "",
    "                  return (",
  ].join("\n"),
  [
    "                  const smsDispatch = smsDispatchBySourceId.get(",
    "                    getSmsSourceId({",
    "                      fixtureId: fixture.id,",
    "                      teamMemberId: member.id,",
    "                    }),",
    "                  );",
    "                  const canChaseBySms =",
    "                    Boolean(memberPhone) &&",
    "                    fixtureCanBeChased &&",
    '                    response === "NO_RESPONSE";',
    "                  const chaseButtonLabel = !memberPhone",
    '                    ? "No phone to chase"',
    '                    : response !== "NO_RESPONSE"',
    '                      ? "Player has replied"',
    "                      : !fixtureCanBeChased",
    '                        ? fixture.status === "POSTPONED"',
    '                          ? "Fixture postponed"',
    '                          : "Fixture has passed"',
    '                        : "Chase by SMS";',
    "",
    "                  return (",
  ].join("\n"),
  "per-player chase eligibility",
);

replaceOnce(
  availabilityPage,
  [
    "                              <button",
    '                                type="submit"',
    "                                disabled={!memberPhone}",
    '                                className="inline-flex w-full items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2.5 text-sm font-medium text-sky-100 transition hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-white/35"',
    "                              >",
    '                                {memberPhone ? "Chase by SMS" : "No phone to chase"}',
    "                              </button>",
  ].join("\n"),
  [
    "                              <button",
    '                                type="submit"',
    "                                disabled={!canChaseBySms}",
    '                                className="inline-flex w-full items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2.5 text-sm font-medium text-sky-100 transition hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-white/35"',
    "                              >",
    "                                {chaseButtonLabel}",
    "                              </button>",
  ].join("\n"),
  "disabled invalid availability chase button",
);

// Enforce the same checks server-side so an old browser tab or crafted form
// cannot send a chase for a past/postponed fixture or a player who replied.
const chaseMarker =
  "export async function sendAvailabilitySmsChaseAction(formData: FormData)";

replaceWithin(
  availabilityActions,
  chaseMarker,
  [
    "    where: {",
    "      id: fixtureId,",
    "      ...publishedFixtureWhere,",
    "      OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],",
    "    },",
  ].join("\n"),
  [
    "    where: {",
    "      id: fixtureId,",
    "      ...publishedFixtureWhere,",
    '      status: "SCHEDULED",',
    "      kickoffAt: { gt: new Date() },",
    "      OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],",
    "    },",
  ].join("\n"),
  "future scheduled fixture guard",
);

replaceWithin(
  availabilityActions,
  chaseMarker,
  [
    "    select: {",
    "      id: true,",
    "      user: { select: { id: true, name: true, email: true } },",
    "    },",
  ].join("\n"),
  [
    "    select: {",
    "      id: true,",
    "      user: { select: { id: true, name: true, email: true } },",
    "      fixtureAvailabilities: {",
    "        where: { fixtureId },",
    "        select: { response: true },",
    "        take: 1,",
    "      },",
    "    },",
  ].join("\n"),
  "existing availability response lookup",
);

replaceWithin(
  availabilityActions,
  chaseMarker,
  [
    "  if (!fixture || !member) {",
    "    redirect(",
    "      buildAvailabilityRedirect(",
    "        teamid,",
    '        "?error=Fixture%20or%20player%20not%20found.",',
    "      ),",
    "    );",
    "  }",
    "",
    "  const profiles = await getTeamMemberProfilesByTeamMemberIds([member.id]);",
  ].join("\n"),
  [
    "  if (!fixture) {",
    "    redirect(",
    "      buildAvailabilityRedirect(",
    "        teamid,",
    '        "?error=This%20fixture%20has%20passed%2C%20is%20postponed%2C%20or%20is%20no%20longer%20available%20to%20chase.",',
    "      ),",
    "    );",
    "  }",
    "",
    "  if (!member) {",
    "    redirect(",
    "      buildAvailabilityRedirect(",
    "        teamid,",
    '        "?error=Player%20not%20found%20for%20this%20team.",',
    "      ),",
    "    );",
    "  }",
    "",
    "  const currentAvailability = member.fixtureAvailabilities[0] ?? null;",
    "  if (",
    "    currentAvailability &&",
    '    currentAvailability.response !== "NO_RESPONSE"',
    "  ) {",
    "    redirect(",
    "      buildAvailabilityRedirect(",
    "        teamid,",
    '        "?error=This%20player%20has%20already%20confirmed%20their%20availability.",',
    "      ),",
    "    );",
    "  }",
    "",
    "  const profiles = await getTeamMemberProfilesByTeamMemberIds([member.id]);",
  ].join("\n"),
  "past fixture and responded-player error handling",
);

replaceWithin(
  availabilityActions,
  chaseMarker,
  [
    '      origin: "captain_availability_sms_chase",',
    '      originLabel: "Availability SMS chase sent from captain availability page",',
    "      teamId: teamid,",
  ].join("\n"),
  [
    '      origin: "captain_availability_sms_chase",',
    '      originLabel: "Availability SMS chase sent from captain availability page",',
    '      actorRole: access.isAdmin ? "ADMIN" : "CAPTAIN",',
    "      actorName: access.user?.name ?? access.user?.email ?? null,",
    "      accessMode: access.accessMode,",
    "      teamId: teamid,",
  ].join("\n"),
  "availability chase sender metadata",
);

// Store CAPTAIN rather than ADMIN when a captain triggered a user-initiated
// notification. Existing entries remain auditable through createdByUser.
replaceOnce(
  dispatchLogger,
  [
    "function getParticipantRole(createdByUserId: string | null): MessageParticipantRole {",
    '  return createdByUserId ? "ADMIN" : "SYSTEM";',
    "}",
  ].join("\n"),
  [
    "function getParticipantRole(",
    '  dispatch: Pick<NotificationDispatch, "createdByUserId" | "metadata">,',
    "): MessageParticipantRole {",
    '  const actorRole = getMetadataString(dispatch.metadata, "actorRole")?.toUpperCase();',
    '  if (actorRole === "CAPTAIN") return "CAPTAIN";',
    '  if (actorRole === "ADMIN") return "ADMIN";',
    '  return dispatch.createdByUserId ? "ADMIN" : "SYSTEM";',
    "}",
  ].join("\n"),
  "dispatch participant role attribution",
);

replaceOnce(
  dispatchLogger,
  "participantRole: getParticipantRole(dispatch.createdByUserId ?? null),",
  "participantRole: getParticipantRole(dispatch),",
  "existing dispatch role call",
);
replaceOnce(
  dispatchLogger,
  "participantRole: getParticipantRole(dispatch.createdByUserId ?? null),",
  "participantRole: getParticipantRole(dispatch),",
  "new dispatch role call",
);

// Load and pass the actual triggering user and dispatch metadata into the admin
// conversation timeline so a user-triggered action is no longer just labelled
// vaguely as "SIXFL admin / Manual SMS".
replaceOnce(
  messagingService,
  '      messages: { orderBy: [{ createdAt: "asc" }], include: { dispatch: { select: { id: true, template: { select: { id: true, name: true, key: true } }, metadata: true } } } },',
  [
    "      messages: {",
    '        orderBy: [{ createdAt: "asc" }],',
    "        include: {",
    "          createdByUser: {",
    "            select: { id: true, name: true, email: true, role: true },",
    "          },",
    "          dispatch: {",
    "            select: {",
    "              id: true,",
    "              template: { select: { id: true, name: true, key: true } },",
    "              metadata: true,",
    "            },",
    "          },",
    "        },",
    "      },",
  ].join("\n"),
  "message sender and dispatch details query",
);

replaceOnce(
  messagingPage,
  [
    "                    readAt: message.readAt?.toISOString() ?? null,",
    "                  })),",
  ].join("\n"),
  [
    "                    readAt: message.readAt?.toISOString() ?? null,",
    "                    createdByUser: message.createdByUser",
    "                      ? {",
    "                          id: message.createdByUser.id,",
    "                          name: message.createdByUser.name,",
    "                          email: message.createdByUser.email,",
    "                          role: message.createdByUser.role,",
    "                        }",
    "                      : null,",
    "                    dispatch: message.dispatch",
    "                      ? {",
    "                          id: message.dispatch.id,",
    "                          template: message.dispatch.template",
    "                            ? {",
    "                                id: message.dispatch.template.id,",
    "                                name: message.dispatch.template.name,",
    "                                key: message.dispatch.template.key,",
    "                              }",
    "                            : null,",
    "                          metadata: message.dispatch.metadata,",
    "                        }",
    "                      : null,",
    "                  })),",
  ].join("\n"),
  "admin messaging sender and source mapping",
);

const senderTypeBlock = [
  "    createdByUser: {",
  "      id: string;",
  "      name: string | null;",
  "      email: string | null;",
  '      role: "USER" | "REFEREE" | "ADMIN";',
  "    } | null;",
].join("\n");

replaceOnce(
  inboxComponent,
  [
    "    readAt: string | null;",
    "    createdAt: string;",
    "    dispatch?: {",
  ].join("\n"),
  [
    "    readAt: string | null;",
    "    createdAt: string;",
    senderTypeBlock,
    "    dispatch?: {",
  ].join("\n"),
  "inbox message sender type",
);

replaceOnce(
  threadComponent,
  [
    "    readAt: string | null;",
    "    createdAt: string;",
    "    dispatch?: {",
  ].join("\n"),
  [
    "    readAt: string | null;",
    "    createdAt: string;",
    senderTypeBlock,
    "    dispatch?: {",
  ].join("\n"),
  "timeline message sender type",
);

replaceOnce(
  threadComponent,
  [
    "function getMessageRoleLabel(",
    '  message: NonNullable<SelectedThread>["messages"][number],',
    "): string {",
    '  if (message.direction === "INBOUND") {',
    '    return "Contact";',
    "  }",
    "",
    "  switch (message.participantRole) {",
    '    case "ADMIN":',
    '      return "SIXFL admin";',
    '    case "CAPTAIN":',
    '      return "Captain";',
    '    case "SYSTEM":',
    '      return "Automated";',
    "    default:",
    '      return "SIXFL";',
    "  }",
    "}",
  ].join("\n"),
  [
    "function getDispatchMetadataRecord(",
    '  message: NonNullable<SelectedThread>["messages"][number],',
    ") {",
    "  const metadata = message.dispatch?.metadata;",
    "  if (!metadata || typeof metadata !== \"object\" || Array.isArray(metadata)) {",
    "    return null;",
    "  }",
    "  return metadata as Record<string, unknown>;",
    "}",
    "",
    "function getDispatchMetadataString(",
    '  message: NonNullable<SelectedThread>["messages"][number],',
    "  key: string,",
    ") {",
    "  const value = getDispatchMetadataRecord(message)?.[key];",
    '  return typeof value === "string" && value.trim() ? value.trim() : null;',
    "}",
    "",
    "function getMessageRoleLabel(",
    '  message: NonNullable<SelectedThread>["messages"][number],',
    "): string {",
    '  if (message.direction === "INBOUND") {',
    '    return "Contact";',
    "  }",
    "",
    "  const actorName =",
    "    message.createdByUser?.name?.trim() ||",
    "    message.createdByUser?.email?.trim() ||",
    "    null;",
    '  const actorRole = getDispatchMetadataString(message, "actorRole")?.toUpperCase();',
    '  const origin = getDispatchMetadataString(message, "origin");',
    "",
    "  if (",
    '    actorRole === "CAPTAIN" ||',
    "    (origin === \"captain_availability_sms_chase\" &&",
    '      message.createdByUser?.role !== "ADMIN")',
    "  ) {",
    '    return actorName ? `Captain · ${actorName}` : "Captain";',
    "  }",
    "",
    '  if (actorRole === "ADMIN" || message.createdByUser?.role === "ADMIN") {',
    '    return actorName ? `SIXFL admin · ${actorName}` : "SIXFL admin";',
    "  }",
    "",
    "  if (actorName) return `Sent by ${actorName}`;",
    "",
    "  switch (message.participantRole) {",
    '    case "ADMIN":',
    '      return "SIXFL admin";',
    '    case "CAPTAIN":',
    '      return "Captain";',
    '    case "SYSTEM":',
    '      return "Automated";',
    "    default:",
    '      return "SIXFL";',
    "  }",
    "}",
  ].join("\n"),
  "accurate timeline sender label",
);

replaceOnce(
  threadComponent,
  [
    "  if (message.direction === \"INBOUND\") {",
    "    return null;",
    "  }",
    "",
    "  if (message.dispatch?.template) {",
  ].join("\n"),
  [
    "  if (message.direction === \"INBOUND\") {",
    "    return null;",
    "  }",
    "",
    '  const originLabel = getDispatchMetadataString(message, "originLabel");',
    "  if (originLabel) {",
    "    return {",
    "      label: originLabel,",
    "      key: null,",
    "    };",
    "  }",
    "",
    "  if (message.dispatch?.template) {",
  ].join("\n"),
  "timeline origin label",
);

for (const filePath of [
  availabilityActions,
  availabilityPage,
  dispatchLogger,
  messagingService,
  messagingPage,
  inboxComponent,
  threadComponent,
]) {
  const source = read(filePath);

  if (filePath === availabilityActions) {
    if (
      !source.includes('status: "SCHEDULED"') ||
      !source.includes("kickoffAt: { gt: new Date() }") ||
      !source.includes('actorRole: access.isAdmin ? "ADMIN" : "CAPTAIN"')
    ) {
      throw new Error("Availability chase server guard was not applied.");
    }
  }

  if (filePath === availabilityPage) {
    if (
      !source.includes("fixtureCanBeChased") ||
      !source.includes("disabled={!canChaseBySms}")
    ) {
      throw new Error("Availability chase UI guard was not applied.");
    }
  }

  if (filePath === threadComponent) {
    if (
      !source.includes("SIXFL admin · ${actorName}") ||
      !source.includes('getDispatchMetadataString(message, "originLabel")')
    ) {
      throw new Error("Message sender/source attribution was not applied.");
    }
  }
}

console.log(
  "Past/postponed availability SMS chases are blocked, and the admin timeline now shows the real triggering user and source.",
);
