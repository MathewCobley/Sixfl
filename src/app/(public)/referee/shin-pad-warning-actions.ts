// ========================================
// File: src/app/(public)/referee/shin-pad-warning-actions.ts
// ========================================

"use server";

import { randomUUID } from "crypto";
import {
  NotificationAudience,
  NotificationChannel,
  NotificationDispatchStatus,
  Prisma,
  UserRole,
} from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireReferee } from "@/lib/admin";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { processNotificationQueue } from "@/lib/notifications/processor";
import { queueDirectNotification } from "@/lib/notifications/service";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import { prisma } from "@/lib/prisma";

const SHIN_PAD_WARNING_SOURCE_TYPE = "TEAM_SHIN_PAD_WARNING";
const EDITABLE_NIGHT_STATUSES = new Set(["DRAFT", "REOPENED"]);

export type ShinPadWarningActionState = {
  status: "idle" | "success" | "info" | "error";
  message: string;
  warningTeamIds: string[];
};

export const INITIAL_SHIN_PAD_WARNING_STATE: ShinPadWarningActionState = {
  status: "idle",
  message: "",
  warningTeamIds: [],
};

type NightFixtureRow = {
  refereeNightId: string;
  refereeId: string;
  nightStatus: string;
  fixtureId: string;
  leagueId: string;
  leagueName: string;
  kickoffAt: Date;
  venueName: string | null;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
};

type TeamDetails = {
  id: string;
  name: string;
};

function parseRequiredString(value: FormDataEntryValue | null, fieldName: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${fieldName} is required.`);
  return text;
}

function formatFixtureDate(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildWarningEmail(input: {
  contactName: string;
  teamName: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoffAt: Date;
  venueName: string | null;
}) {
  return [
    `Hi ${input.contactName},`,
    "",
    "SHIN PAD WARNING",
    "",
    `It was noted at the following SIXFL fixture that a number of players from ${input.teamName} were not wearing shin pads:`,
    "",
    `Fixture: ${input.homeTeamName} v ${input.awayTeamName}`,
    `Date and kick-off: ${formatFixtureDate(input.kickoffAt)}`,
    `Venue: ${input.venueName || "SIXFL venue"}`,
    "",
    "Shin pads are a mandatory requirement under The FA Laws of the Game. Please make sure every player brings and wears suitable shin pads for all future SIXFL fixtures.",
    "",
    "Players who do not have shin pads may not be permitted to play.",
    "",
    `This warning has been recorded against ${input.teamName}. Please ensure the issue is addressed before the team's next fixture.`,
  ].join("\n");
}

async function getNightFixture(
  refereeNightId: string,
  fixtureId: string,
): Promise<NightFixtureRow | null> {
  const rows = await prisma.$queryRaw<NightFixtureRow[]>(Prisma.sql`
    SELECT
      rn."id" AS "refereeNightId",
      rn."refereeId",
      rn."status"::text AS "nightStatus",
      fixture."id" AS "fixtureId",
      fixture."leagueId",
      league."name" AS "leagueName",
      fixture."kickoffAt",
      venue."name" AS "venueName",
      fixture."homeTeamId",
      home_team."name" AS "homeTeamName",
      fixture."awayTeamId",
      away_team."name" AS "awayTeamName"
    FROM "RefereeNight" rn
    INNER JOIN "RefereeNightFixture" rnf
      ON rnf."refereeNightId" = rn."id"
    INNER JOIN "Fixture" fixture
      ON fixture."id" = rnf."fixtureId"
    INNER JOIN "League" league
      ON league."id" = fixture."leagueId"
    INNER JOIN "Team" home_team
      ON home_team."id" = fixture."homeTeamId"
    INNER JOIN "Team" away_team
      ON away_team."id" = fixture."awayTeamId"
    LEFT JOIN "Venue" venue
      ON venue."id" = fixture."venueId"
    WHERE rn."id" = ${refereeNightId}
      AND fixture."id" = ${fixtureId}
    LIMIT 1
  `);

  return rows[0] ?? null;
}

async function insertWarning(input: {
  teamId: string;
  fixtureId: string;
  refereeNightId: string;
  reportedByUserId: string;
}) {
  const warningId = randomUUID();
  const inserted = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO "TeamShinPadWarning" (
      "id",
      "teamId",
      "fixtureId",
      "refereeNightId",
      "reportedByUserId",
      "createdAt",
      "updatedAt"
    ) VALUES (
      ${warningId},
      ${input.teamId},
      ${input.fixtureId},
      ${input.refereeNightId},
      ${input.reportedByUserId},
      NOW(),
      NOW()
    )
    ON CONFLICT ("fixtureId", "teamId") DO NOTHING
    RETURNING "id"
  `);

  return inserted[0]?.id ?? null;
}

async function attachDispatchToWarning(input: {
  warningId: string;
  dispatchId: string;
  email: string | null;
  queued: boolean;
}) {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "TeamShinPadWarning"
    SET
      "notificationDispatchId" = ${input.dispatchId},
      "emailSentTo" = ${input.email},
      "emailQueuedAt" = ${input.queued ? new Date() : null},
      "updatedAt" = NOW()
    WHERE "id" = ${input.warningId}
  `);
}

function buildActionMessage(input: {
  created: number;
  sent: number;
  queued: number;
  existing: number;
  unavailable: number;
  failed: number;
}) {
  const parts: string[] = [];

  if (input.sent > 0) {
    parts.push(`${input.sent} shin pad warning email${input.sent === 1 ? " was" : "s were"} sent and recorded.`);
  }

  if (input.queued > 0) {
    parts.push(`${input.queued} warning email${input.queued === 1 ? " is" : "s are"} queued for sending.`);
  }

  if (input.unavailable > 0) {
    parts.push(`${input.unavailable} warning${input.unavailable === 1 ? " was" : "s were"} recorded, but no usable team email was available.`);
  }

  if (input.failed > 0) {
    parts.push(`${input.failed} warning email${input.failed === 1 ? " could" : "s could"} not be sent; the warning record remains on the team.`);
  }

  if (input.existing > 0) {
    parts.push(`${input.existing} selected team${input.existing === 1 ? " already has" : "s already have"} a shin pad warning for this fixture, so no duplicate was sent.`);
  }

  if (parts.length === 0 && input.created > 0) {
    parts.push(`${input.created} shin pad warning${input.created === 1 ? " was" : "s were"} recorded.`);
  }

  return parts.join(" ") || "No new shin pad warning was created.";
}

export async function recordShinPadWarningAction(
  _previousState: ShinPadWarningActionState,
  formData: FormData,
): Promise<ShinPadWarningActionState> {
  try {
    const { user } = await requireReferee();
    const refereeNightId = parseRequiredString(
      formData.get("refereeNightId"),
      "Referee night",
    );
    const fixtureId = parseRequiredString(formData.get("fixtureId"), "Fixture");
    const selectedTeamIds = Array.from(
      new Set(
        formData
          .getAll("teamIds")
          .map((value) => String(value).trim())
          .filter(Boolean),
      ),
    );

    if (selectedTeamIds.length === 0) {
      return {
        status: "error",
        message: "Tick at least one team before sending a shin pad warning.",
        warningTeamIds: [],
      };
    }

    const fixture = await getNightFixture(refereeNightId, fixtureId);
    if (!fixture) {
      return {
        status: "error",
        message: "This fixture is not attached to the selected referee night.",
        warningTeamIds: [],
      };
    }

    const canAccess =
      user.role === UserRole.ADMIN || fixture.refereeId === user.id;
    if (!canAccess) {
      return {
        status: "error",
        message: "You are not allowed to record a warning for this referee night.",
        warningTeamIds: [],
      };
    }

    if (!EDITABLE_NIGHT_STATUSES.has(fixture.nightStatus)) {
      return {
        status: "error",
        message: "This cashup is locked, so no new shin pad warning can be recorded.",
        warningTeamIds: [],
      };
    }

    const teams = new Map<string, TeamDetails>([
      [fixture.homeTeamId, { id: fixture.homeTeamId, name: fixture.homeTeamName }],
      [fixture.awayTeamId, { id: fixture.awayTeamId, name: fixture.awayTeamName }],
    ]);
    const validTeamIds = selectedTeamIds.filter((teamId) => teams.has(teamId));

    if (validTeamIds.length !== selectedTeamIds.length) {
      return {
        status: "error",
        message: "One of the selected teams is not part of this fixture.",
        warningTeamIds: [],
      };
    }

    const dispatchIds: string[] = [];
    const warningTeamIds: string[] = [];
    let created = 0;
    let existing = 0;
    let unavailable = 0;
    let queueFailures = 0;

    for (const teamId of validTeamIds) {
      const team = teams.get(teamId);
      if (!team) continue;

      const warningId = await insertWarning({
        teamId,
        fixtureId,
        refereeNightId,
        reportedByUserId: user.id,
      });

      warningTeamIds.push(teamId);

      if (!warningId) {
        existing += 1;
        continue;
      }

      created += 1;

      try {
        const { recipient, snapshot } = await upsertTeamNotificationRecipient(teamId);
        const email = recipient.email?.trim() || snapshot.primaryContact.email?.trim() || null;

        if (!email) {
          unavailable += 1;
          continue;
        }

        const contactName =
          snapshot.primaryContact.name?.trim() || snapshot.teamName;
        const dispatch = await queueDirectNotification({
          recipientId: recipient.id,
          channel: NotificationChannel.EMAIL,
          audience: NotificationAudience.TEAM,
          subject: `Shin pad warning: ${team.name} – ${fixture.homeTeamName} v ${fixture.awayTeamName}`,
          body: buildWarningEmail({
            contactName,
            teamName: team.name,
            homeTeamName: fixture.homeTeamName,
            awayTeamName: fixture.awayTeamName,
            kickoffAt: fixture.kickoffAt,
            venueName: fixture.venueName,
          }),
          isTransactional: true,
          sourceType: SHIN_PAD_WARNING_SOURCE_TYPE,
          sourceId: warningId,
          createdByUserId: user.id,
          metadata: {
            originLabel: "Shin pad warning",
            warningId,
            teamId,
            teamName: team.name,
            fixtureId,
            refereeNightId,
            leagueId: fixture.leagueId,
            leagueName: fixture.leagueName,
            contactName,
            homeTeamName: fixture.homeTeamName,
            awayTeamName: fixture.awayTeamName,
            kickoffAt: fixture.kickoffAt.toISOString(),
            venueName: fixture.venueName,
          },
        });

        dispatchIds.push(dispatch.id);
        await attachDispatchToWarning({
          warningId,
          dispatchId: dispatch.id,
          email,
          queued: dispatch.status === NotificationDispatchStatus.QUEUED,
        });

        if (dispatch.status !== NotificationDispatchStatus.QUEUED) {
          queueFailures += 1;
        }
      } catch (error) {
        queueFailures += 1;
        console.error("Failed to queue shin pad warning email", {
          fixtureId,
          teamId,
          error,
        });
      }
    }

    if (dispatchIds.length > 0) {
      try {
        await processNotificationQueue(100);
      } catch (error) {
        console.error("Failed to process shin pad warning emails immediately", error);
      }
    }

    const dispatches = dispatchIds.length
      ? await prisma.notificationDispatch.findMany({
          where: { id: { in: dispatchIds } },
          select: {
            id: true,
            status: true,
            sentAt: true,
          },
        })
      : [];

    const sentDispatches = dispatches.filter(
      (dispatch) => dispatch.status === NotificationDispatchStatus.SENT,
    );
    const queuedDispatches = dispatches.filter(
      (dispatch) =>
        dispatch.status === NotificationDispatchStatus.QUEUED ||
        dispatch.status === NotificationDispatchStatus.PROCESSING,
    );
    const failedDispatches = dispatches.filter(
      (dispatch) =>
        dispatch.status === NotificationDispatchStatus.FAILED ||
        dispatch.status === NotificationDispatchStatus.SKIPPED ||
        dispatch.status === NotificationDispatchStatus.CANCELLED,
    );

    await Promise.all(
      sentDispatches.map((dispatch) =>
        prisma.$executeRaw(Prisma.sql`
          UPDATE "TeamShinPadWarning"
          SET
            "emailSentAt" = ${dispatch.sentAt ?? new Date()},
            "updatedAt" = NOW()
          WHERE "notificationDispatchId" = ${dispatch.id}
        `),
      ),
    );

    for (const teamId of validTeamIds) {
      revalidatePath(`/admin/teams/${teamId}`);
      revalidatePath(`/admin/teams/${teamId}/communications`);
      revalidatePath(`/admin/teams/${teamId}/shin-pad-warnings`);
    }

    revalidatePath(`/referee/night/${refereeNightId}`);
    revalidatePath(`/admin/referee-nights/${refereeNightId}`);
    revalidatePath("/admin/teams");

    const failed = failedDispatches.length + queueFailures;
    const message = buildActionMessage({
      created,
      sent: sentDispatches.length,
      queued: queuedDispatches.length,
      existing,
      unavailable,
      failed,
    });

    return {
      status:
        failed > 0 || unavailable > 0
          ? "info"
          : created > 0
            ? "success"
            : "info",
      message,
      warningTeamIds,
    };
  } catch (error) {
    console.error("Shin pad warning action failed", error);

    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "The shin pad warning could not be recorded.",
      warningTeamIds: [],
    };
  }
}
