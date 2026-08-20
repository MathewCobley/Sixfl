import { Prisma } from "@prisma/client";

import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import { processNotificationQueue } from "@/lib/notifications/processor";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import { prisma } from "@/lib/prisma";

export const FORMAL_CONDUCT_NOTICE_TEMPLATE_KEY =
  "fixture-abandonment-formal-conduct-email";

const CONDUCT_REASON_LABELS: Record<string, string> = {
  REFUSED_TO_LEAVE: "Player / manager refused to leave after referee instruction",
  TEAM_CONDUCT: "Conduct of one team made the match impossible to continue",
  VIOLENT_OR_THREATENING_CONDUCT: "Violent, threatening or aggressive conduct",
  SERIOUS_MISCONDUCT: "Other serious player / manager misconduct",
};

export function isFixtureConductAbandonmentReason(reason: string) {
  return Boolean(CONDUCT_REASON_LABELS[reason]);
}

type AbandonmentConductRow = {
  fixtureId: string;
  reason: string;
  responsibleTeamId: string | null;
  details: string | null;
};

function firstName(value: string | null | undefined) {
  return value?.trim().split(/\s+/)[0]?.trim() || "there";
}

export async function sendFixtureFormalConductNotice(input: {
  fixtureId: string;
  createdByUserId: string;
  resend?: boolean;
}) {
  const rows = await prisma.$queryRaw<AbandonmentConductRow[]>(Prisma.sql`
    SELECT
      "fixtureId",
      "reason",
      "responsibleTeamId",
      "details"
    FROM "FixtureAbandonment"
    WHERE "fixtureId" = ${input.fixtureId}
    LIMIT 1
  `);
  const abandonment = rows[0];

  if (!abandonment) {
    throw new Error("This fixture is not recorded as abandoned.");
  }
  if (!isFixtureConductAbandonmentReason(abandonment.reason)) {
    throw new Error("This abandonment is not a team-conduct incident.");
  }
  if (!abandonment.responsibleTeamId) {
    throw new Error("No responsible team is recorded for this abandonment.");
  }

  const fixture = await prisma.fixture.findUnique({
    where: { id: input.fixtureId },
    select: {
      id: true,
      homeTeam: {
        select: {
          id: true,
          name: true,
          logoUrl: true,
          league: { select: { name: true, season: true } },
        },
      },
      awayTeam: {
        select: {
          id: true,
          name: true,
          logoUrl: true,
          league: { select: { name: true, season: true } },
        },
      },
    },
  });

  if (!fixture) throw new Error("Fixture not found.");

  const responsibleTeam =
    abandonment.responsibleTeamId === fixture.homeTeam.id
      ? fixture.homeTeam
      : abandonment.responsibleTeamId === fixture.awayTeam.id
        ? fixture.awayTeam
        : null;

  if (!responsibleTeam) {
    throw new Error("The recorded responsible team is not part of this fixture.");
  }

  const { recipient, snapshot } = await upsertTeamNotificationRecipient(
    responsibleTeam.id,
  );
  const leagueName = responsibleTeam.league
    ? `${responsibleTeam.league.name}${responsibleTeam.league.season ? ` — ${responsibleTeam.league.season}` : ""}`
    : snapshot.leagueName;
  const fixtureLabel = `${fixture.homeTeam.name} v ${fixture.awayTeam.name}`;
  const reasonLabel = CONDUCT_REASON_LABELS[abandonment.reason];
  const refereeNoteLine = abandonment.details?.trim()
    ? `Referee note: ${abandonment.details.trim()}\n`
    : "";

  const dispatch = await queueNotificationFromTemplate({
    templateKey: FORMAL_CONDUCT_NOTICE_TEMPLATE_KEY,
    recipientId: recipient.id,
    variables: {
      firstName: firstName(snapshot.primaryContact.name ?? snapshot.teamName),
      teamName: responsibleTeam.name,
      fixtureLabel,
      reasonLabel,
      refereeNoteLine,
    },
    sourceType: "TEAM",
    sourceId: responsibleTeam.id,
    metadata: {
      origin: "fixture-abandonment-formal-conduct",
      originLabel: "Formal conduct notice",
      teamId: responsibleTeam.id,
      teamName: responsibleTeam.name,
      leagueId: snapshot.leagueId,
      fixtureId: fixture.id,
      reason: abandonment.reason,
      formalConductNotice: true,
      resend: Boolean(input.resend),
      contactName: snapshot.primaryContact.name,
    },
    emailBranding: {
      teamName: responsibleTeam.name,
      teamLogoUrl: responsibleTeam.logoUrl,
      leagueName: leagueName || null,
    },
    createdByUserId: input.createdByUserId,
  });

  await logNotificationDispatchToThread({ dispatch, recipient });

  if (dispatch.status === "QUEUED") {
    try {
      await processNotificationQueue(20);
    } catch (error) {
      console.error("Formal conduct notice was queued but immediate processing failed", error);
    }
  }

  const finalDispatch = await prisma.notificationDispatch.findUnique({
    where: { id: dispatch.id },
    select: {
      id: true,
      status: true,
      failureReason: true,
      sentAt: true,
    },
  });

  return {
    dispatchId: dispatch.id,
    teamId: responsibleTeam.id,
    teamName: responsibleTeam.name,
    status: finalDispatch?.status ?? dispatch.status,
    failureReason: finalDispatch?.failureReason ?? dispatch.failureReason ?? null,
    sentAt: finalDispatch?.sentAt ?? dispatch.sentAt ?? null,
  };
}
