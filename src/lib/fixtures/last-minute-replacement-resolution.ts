import { randomUUID } from "node:crypto";
import { NotificationChannel, Prisma } from "@prisma/client";

import { sendTeamBroadcastMessage } from "@/lib/communications/send-team-broadcast";
import { processNotificationQueue } from "@/lib/notifications/processor";
import { prisma } from "@/lib/prisma";

const INITIAL_ORIGIN = "night-board-last-minute-replacement";
const RESOLVED_ORIGIN = "night-board-last-minute-replacement-resolved";

const LIVE_DISPATCH_STATUSES = ["QUEUED", "PROCESSING", "SENT"] as const;

type InitialAlertCycle = {
  fixtureId: string;
  droppedTeamId: string;
  opponentTeamId: string;
  createdAt: Date;
};

type ResolutionRow = {
  id: string;
  fixtureId: string;
  droppedTeamId: string;
  replacementTeamId: string;
  opponentTeamId: string;
  resolvedAt: Date;
  replacementTeamName: string;
  opponentTeamName: string;
};

export type LastMinuteReplacementControlState =
  | { status: "idle" }
  | { status: "alert_sent"; droppedTeamId: string }
  | {
      status: "resolved";
      droppedTeamId: string;
      replacementTeamId: string;
      replacementTeamName: string;
      opponentTeamId: string;
      opponentTeamName: string;
      resolvedAt: string;
    };

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(value);
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

function formatMoney(pence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: pence % 100 === 0 ? 0 : 2,
  }).format(pence / 100);
}

async function getLatestInitialAlertCycle(fixtureId: string) {
  const rows = await prisma.$queryRaw<InitialAlertCycle[]>(Prisma.sql`
    SELECT
      dispatch."metadata"->>'fixtureId' AS "fixtureId",
      dispatch."metadata"->>'droppedTeamId' AS "droppedTeamId",
      dispatch."metadata"->>'opponentTeamId' AS "opponentTeamId",
      dispatch."createdAt" AS "createdAt"
    FROM "NotificationDispatch" dispatch
    WHERE dispatch."metadata"->>'origin' = ${INITIAL_ORIGIN}
      AND dispatch."metadata"->>'fixtureId' = ${fixtureId}
      AND dispatch."status"::text IN (${Prisma.join([...LIVE_DISPATCH_STATUSES])})
      AND COALESCE(dispatch."metadata"->>'droppedTeamId', '') <> ''
      AND COALESCE(dispatch."metadata"->>'opponentTeamId', '') <> ''
    ORDER BY dispatch."createdAt" DESC
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function getResolution(fixtureId: string, droppedTeamId?: string | null) {
  const rows = await prisma.$queryRaw<ResolutionRow[]>(Prisma.sql`
    SELECT
      resolution."id",
      resolution."fixtureId",
      resolution."droppedTeamId",
      resolution."replacementTeamId",
      resolution."opponentTeamId",
      resolution."resolvedAt",
      replacement."name" AS "replacementTeamName",
      opponent."name" AS "opponentTeamName"
    FROM "LastMinuteReplacementResolution" resolution
    JOIN "Team" replacement ON replacement."id" = resolution."replacementTeamId"
    JOIN "Team" opponent ON opponent."id" = resolution."opponentTeamId"
    WHERE resolution."fixtureId" = ${fixtureId}
      ${droppedTeamId ? Prisma.sql`AND resolution."droppedTeamId" = ${droppedTeamId}` : Prisma.empty}
    ORDER BY resolution."resolvedAt" DESC
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function getContactedTeamIds(input: {
  fixtureId: string;
  droppedTeamId: string;
}) {
  const rows = await prisma.$queryRaw<Array<{ teamId: string }>>(Prisma.sql`
    SELECT DISTINCT dispatch."metadata"->>'teamId' AS "teamId"
    FROM "NotificationDispatch" dispatch
    WHERE dispatch."metadata"->>'origin' = ${INITIAL_ORIGIN}
      AND dispatch."metadata"->>'fixtureId' = ${input.fixtureId}
      AND dispatch."metadata"->>'droppedTeamId' = ${input.droppedTeamId}
      AND dispatch."status"::text IN (${Prisma.join([...LIVE_DISPATCH_STATUSES])})
      AND COALESCE(dispatch."metadata"->>'teamId', '') <> ''
  `);
  return rows.map((row) => row.teamId);
}

function toControlState(row: ResolutionRow): LastMinuteReplacementControlState {
  return {
    status: "resolved",
    droppedTeamId: row.droppedTeamId,
    replacementTeamId: row.replacementTeamId,
    replacementTeamName: row.replacementTeamName,
    opponentTeamId: row.opponentTeamId,
    opponentTeamName: row.opponentTeamName,
    resolvedAt: row.resolvedAt.toISOString(),
  };
}

export async function getLastMinuteReplacementControlState(input: {
  fixtureId: string;
  currentTeamId: string;
}): Promise<LastMinuteReplacementControlState> {
  const resolution = await getResolution(input.fixtureId);
  if (resolution) return toControlState(resolution);

  const alert = await getLatestInitialAlertCycle(input.fixtureId);
  if (alert?.droppedTeamId === input.currentTeamId) {
    return { status: "alert_sent", droppedTeamId: alert.droppedTeamId };
  }

  return { status: "idle" };
}

async function sendResolutionMessage(input: {
  teamId: string;
  role: "replacement" | "opponent" | "not_selected";
  fixtureId: string;
  droppedTeamId: string;
  replacementTeamId: string;
  replacementTeamName: string;
  opponentTeamId: string;
  opponentTeamName: string;
  kickoffAt: Date;
  venueName: string;
  pitch: string;
  replacementFeePence: number | null;
  createdByUserId?: string | null;
}) {
  const date = formatDate(input.kickoffAt);
  const time = formatTime(input.kickoffAt);
  const details = [
    `Date: ${date}`,
    `Kick-off: ${time}`,
    `Venue: ${input.venueName}`,
    `Pitch: ${input.pitch}`,
  ].join("\n");

  let subject: string;
  let body: string;
  let sms: string;

  if (input.role === "replacement") {
    const feeLine =
      input.replacementFeePence === null || input.replacementFeePence === 0
        ? "There is no charge for this extra game."
        : `The fixture fee currently showing for your team is ${formatMoney(input.replacementFeePence)}.`;
    subject = `Confirmed: your extra SIXFL fixture at ${time}`;
    body = [
      "Hi {{firstName}},",
      "",
      `Confirmed — {{teamName}} have been allocated the extra fixture against ${input.opponentTeamName}.`,
      "",
      details,
      "",
      feeLine,
      "",
      "Please make sure your players know they are playing this extra fixture.",
      "",
      "Thanks,",
      "SIXFL",
    ].join("\n");
    sms = `SIXFL: Confirmed — {{teamName}} have the extra ${time} fixture v ${input.opponentTeamName}. ${feeLine}`;
  } else if (input.role === "opponent") {
    subject = `Replacement confirmed for your ${time} SIXFL fixture`;
    body = [
      "Hi {{firstName}},",
      "",
      `Replacement confirmed — your ${time} fixture will now be against ${input.replacementTeamName}.`,
      "",
      details,
      "",
      "Your normal fixture arrangements remain in place.",
      "",
      "Thanks,",
      "SIXFL",
    ].join("\n");
    sms = `SIXFL: Replacement confirmed for ${time}. You will now play ${input.replacementTeamName}. Your normal fixture arrangements remain in place.`;
  } else {
    subject = `SIXFL extra fixture now covered at ${time}`;
    body = [
      "Hi {{firstName}},",
      "",
      `Thanks — the extra ${time} fixture has now been allocated to ${input.replacementTeamName}.`,
      "",
      `{{teamName}} are not required for this extra game.`,
      "",
      `Date: ${date}`,
      `Kick-off: ${time}`,
      "",
      "Thanks for being available to help.",
      "",
      "SIXFL",
    ].join("\n");
    sms = `SIXFL: The extra ${time} fixture has now been allocated to ${input.replacementTeamName}. {{teamName}} are not required for this extra game. Thanks for being available.`;
  }

  const metadata = {
    event: "fixture.last_minute_replacement.resolved",
    fixtureId: input.fixtureId,
    droppedTeamId: input.droppedTeamId,
    replacementTeamId: input.replacementTeamId,
    opponentTeamId: input.opponentTeamId,
    role: input.role,
  };

  const [emailResult, smsResult] = await Promise.all([
    sendTeamBroadcastMessage({
      teamId: input.teamId,
      channel: NotificationChannel.EMAIL,
      subject,
      body,
      origin: RESOLVED_ORIGIN,
      originLabel: "Last-minute replacement resolved",
      metadata,
      createdByUserId: input.createdByUserId ?? null,
    }),
    sendTeamBroadcastMessage({
      teamId: input.teamId,
      channel: NotificationChannel.SMS,
      body: sms,
      origin: RESOLVED_ORIGIN,
      originLabel: "Last-minute replacement resolved",
      metadata,
      createdByUserId: input.createdByUserId ?? null,
    }),
  ]);

  return [emailResult.dispatchId, smsResult.dispatchId];
}

export async function reconcileLastMinuteReplacement(input: {
  fixtureId: string;
  createdByUserId?: string | null;
}) {
  const alert = await getLatestInitialAlertCycle(input.fixtureId);
  if (!alert) {
    return { resolved: false as const, reason: "no_alert" as const, state: null };
  }

  const existing = await getResolution(input.fixtureId, alert.droppedTeamId);
  if (existing) {
    return { resolved: false as const, reason: "already_resolved" as const, state: toControlState(existing) };
  }

  const fixture = await prisma.fixture.findUnique({
    where: { id: input.fixtureId },
    select: {
      id: true,
      status: true,
      kickoffAt: true,
      pitch: true,
      matchFeePence: true,
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
      venue: { select: { name: true } },
      league: { select: { venueName: true } },
      paymentCharges: {
        where: { status: { not: "VOID" } },
        select: { teamId: true, amountPence: true },
      },
    },
  });

  if (!fixture || fixture.status !== "SCHEDULED" || fixture.kickoffAt <= new Date()) {
    return { resolved: false as const, reason: "fixture_not_active" as const, state: null };
  }

  const currentTeamIds = [fixture.homeTeam.id, fixture.awayTeam.id];
  if (currentTeamIds.includes(alert.droppedTeamId)) {
    return { resolved: false as const, reason: "not_allocated_yet" as const, state: null };
  }

  if (!currentTeamIds.includes(alert.opponentTeamId)) {
    return { resolved: false as const, reason: "opponent_changed" as const, state: null };
  }

  const replacementTeam =
    fixture.homeTeam.id === alert.opponentTeamId ? fixture.awayTeam : fixture.homeTeam;
  const opponentTeam =
    fixture.homeTeam.id === alert.opponentTeamId ? fixture.homeTeam : fixture.awayTeam;

  const inserted = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO "LastMinuteReplacementResolution" (
      "id", "fixtureId", "droppedTeamId", "replacementTeamId", "opponentTeamId", "createdByUserId"
    ) VALUES (
      ${randomUUID()}, ${fixture.id}, ${alert.droppedTeamId}, ${replacementTeam.id}, ${opponentTeam.id}, ${input.createdByUserId ?? null}
    )
    ON CONFLICT ("fixtureId", "droppedTeamId", "replacementTeamId") DO NOTHING
    RETURNING "id"
  `);

  if (!inserted[0]) {
    const concurrent = await getResolution(fixture.id, alert.droppedTeamId);
    return {
      resolved: false as const,
      reason: "already_resolved" as const,
      state: concurrent ? toControlState(concurrent) : null,
    };
  }

  const contactedTeamIds = await getContactedTeamIds({
    fixtureId: fixture.id,
    droppedTeamId: alert.droppedTeamId,
  });
  const recipientRoles = new Map<string, "replacement" | "opponent" | "not_selected">();
  recipientRoles.set(replacementTeam.id, "replacement");
  recipientRoles.set(opponentTeam.id, "opponent");
  for (const teamId of contactedTeamIds) {
    if (
      teamId !== replacementTeam.id &&
      teamId !== opponentTeam.id &&
      teamId !== alert.droppedTeamId
    ) {
      recipientRoles.set(teamId, "not_selected");
    }
  }

  const replacementCharge = fixture.paymentCharges.find(
    (charge) => charge.teamId === replacementTeam.id,
  );
  const venueName = fixture.venue?.name || fixture.league.venueName || "Venue TBC";
  const pitch = fixture.pitch?.trim() || "TBC";
  const dispatchIds: string[] = [];
  let failedTeams = 0;

  for (const [teamId, role] of recipientRoles) {
    try {
      dispatchIds.push(
        ...(await sendResolutionMessage({
          teamId,
          role,
          fixtureId: fixture.id,
          droppedTeamId: alert.droppedTeamId,
          replacementTeamId: replacementTeam.id,
          replacementTeamName: replacementTeam.name,
          opponentTeamId: opponentTeam.id,
          opponentTeamName: opponentTeam.name,
          kickoffAt: fixture.kickoffAt,
          venueName,
          pitch,
          replacementFeePence: replacementCharge?.amountPence ?? null,
          createdByUserId: input.createdByUserId ?? null,
        })),
      );
    } catch (error) {
      failedTeams += 1;
      console.error("Could not queue last-minute replacement resolution message", {
        fixtureId: fixture.id,
        teamId,
        role,
        error,
      });
    }
  }

  if (dispatchIds.length > 0) {
    await processNotificationQueue(Math.min(500, Math.max(50, dispatchIds.length + 20)));
  }

  const state: LastMinuteReplacementControlState = {
    status: "resolved",
    droppedTeamId: alert.droppedTeamId,
    replacementTeamId: replacementTeam.id,
    replacementTeamName: replacementTeam.name,
    opponentTeamId: opponentTeam.id,
    opponentTeamName: opponentTeam.name,
    resolvedAt: new Date().toISOString(),
  };

  return {
    resolved: true as const,
    reason: "resolved" as const,
    state,
    contactedTeams: recipientRoles.size,
    failedTeams,
  };
}

export async function reconcilePendingLastMinuteReplacements(limit = 40) {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 100));
  const rows = await prisma.$queryRaw<Array<{ fixtureId: string }>>(Prisma.sql`
    SELECT DISTINCT dispatch."metadata"->>'fixtureId' AS "fixtureId"
    FROM "NotificationDispatch" dispatch
    WHERE dispatch."metadata"->>'origin' = ${INITIAL_ORIGIN}
      AND dispatch."status"::text IN (${Prisma.join([...LIVE_DISPATCH_STATUSES])})
      AND dispatch."createdAt" >= CURRENT_TIMESTAMP - INTERVAL '14 days'
      AND COALESCE(dispatch."metadata"->>'fixtureId', '') <> ''
    LIMIT ${safeLimit}
  `);

  let resolved = 0;
  let waiting = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const result = await reconcileLastMinuteReplacement({ fixtureId: row.fixtureId });
      if (result.resolved) resolved += 1;
      else waiting += 1;
    } catch (error) {
      failed += 1;
      console.error("Last-minute replacement reconciliation failed", {
        fixtureId: row.fixtureId,
        error,
      });
    }
  }

  return { checked: rows.length, resolved, waiting, failed };
}
