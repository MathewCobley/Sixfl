// ========================================
// File: src/app/captain/team/[teamid]/availability/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  NotificationAudience,
  NotificationRecipientSourceType,
  Prisma,
} from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { publishedFixtureWhere } from "@/lib/fixtures/publishing";
import { normalizePhoneNumber } from "@/lib/messaging/phone";
import { processNotificationQueue } from "@/lib/notifications/processor";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { queueDirectNotification } from "@/lib/notifications/service";
import { cancelQueuedPlayerMatchFeeNotificationDispatches } from "@/lib/payments/cancel-player-match-fee-notifications";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";

const ALLOWED_RESPONSES = [
  "AVAILABLE",
  "UNAVAILABLE",
  "MAYBE",
  "NO_RESPONSE",
] as const;
type AvailabilityResponse = (typeof ALLOWED_RESPONSES)[number];

const AVAILABILITY_SMS_CHASE_SOURCE_TYPE = "CAPTAIN_AVAILABILITY_SMS_CHASE";
const AVAILABILITY_RESET_SOURCE_TYPES = [
  AVAILABILITY_SMS_CHASE_SOURCE_TYPE,
  "MANAGED_SQUAD_AVAILABILITY_REQUEST",
  "MANAGED_SQUAD_AVAILABILITY_CHASE_24H",
  "MANAGED_SQUAD_AVAILABILITY_CHASE_72H",
] as const;

function getResponseValue(
  value: FormDataEntryValue | null,
): AvailabilityResponse {
  const parsed = String(value ?? "")
    .trim()
    .toUpperCase();
  return ALLOWED_RESPONSES.includes(parsed as AvailabilityResponse)
    ? (parsed as AvailabilityResponse)
    : "NO_RESPONSE";
}

function normaliseNullableString(value: FormDataEntryValue | null) {
  const parsed = String(value ?? "").trim();
  return parsed ? parsed : null;
}

function buildAvailabilityRedirect(teamid: string, query: string) {
  return `/captain/team/${teamid}/availability${query}`;
}

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function getResponseLabel(response: AvailabilityResponse) {
  switch (response) {
    case "AVAILABLE":
      return "Available";
    case "MAYBE":
      return "Maybe";
    case "UNAVAILABLE":
      return "Unavailable";
    default:
      return "No response";
  }
}

function appendNote(input: { existingNote: string | null; note: string }) {
  const existingNote = input.existingNote?.trim();
  if (!existingNote) return input.note;
  if (existingNote.includes(input.note)) return existingNote;
  return `${existingNote}\n${input.note}`;
}

function getAutomaticFeeCancellationNote(response: AvailabilityResponse) {
  return `Unpaid fee cancelled automatically because the player's availability changed to ${getResponseLabel(response)} before kickoff. No payment was taken and no credit is due.`;
}

function getAvailabilitySavedMessage(input: {
  response: AvailabilityResponse;
  fixtureStarted: boolean;
  autoCancelled: boolean;
  fee: {
    status: "OPEN" | "PAID" | "WAIVED" | "CANCELLED";
    amountPence: number;
    paidAt: Date | null;
  } | null;
}) {
  const { response, fixtureStarted, autoCancelled, fee } = input;
  const responseLabel = getResponseLabel(response);

  if (response === "AVAILABLE") {
    if (fee?.status === "CANCELLED") {
      return "Availability updated to Available. Their previous fee remains cancelled; select them again in Matchday Squad if they will play.";
    }

    return "Availability updated to Available.";
  }

  if (!fee) {
    return `Availability updated to ${responseLabel}. The player is not in the confirmed matchday squad and has no fee open.`;
  }

  if (autoCancelled) {
    return `Availability updated to ${responseLabel}. Their unpaid fee was cancelled automatically, so no payment or credit is due.`;
  }

  if (fee.status === "PAID") {
    return `Availability updated to ${responseLabel}. This player has already paid ${formatMoney(fee.amountPence)}. Their payment has not been changed automatically; review Matchday Squad and confirm whether to retain the charge or remove them and create player credit.`;
  }

  if (fee.status === "CANCELLED") {
    return fee.paidAt
      ? `Availability updated to ${responseLabel}. The player is not selected; their previous payment is retained for audit and player credit has been created.`
      : `Availability updated to ${responseLabel}. The player is not selected and their unpaid fee is cancelled. No payment or credit is due.`;
  }

  if (fixtureStarted) {
    return `Availability updated to ${responseLabel}. The fixture has already started, so the existing fee was left unchanged for reconciliation.`;
  }

  return `Availability updated to ${responseLabel}. Review Matchday Squad before collecting payment.`;
}

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "https://www.sixfl.co.uk"
  ).replace(/\/+$/, "");
}

function getAvailabilityUrl(teamid: string, fixtureId: string) {
  return `${getSiteUrl()}/player/team/${teamid}/availability?fixtureId=${encodeURIComponent(fixtureId)}`;
}

function formatFixtureDate(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFirstName(value: string) {
  return value.trim().split(/\s+/)[0] || "there";
}

function getPlayerDisplayName(input: {
  name: string | null;
  email: string | null;
}) {
  return input.name?.trim() || input.email?.trim() || "Player";
}

function getSmsSourceId(input: {
  fixtureId: string;
  teamMemberId: string;
}) {
  return `${input.fixtureId}:${input.teamMemberId}`;
}

function getSmsSavedMessage(status: string) {
  switch (status) {
    case "QUEUED":
      return "Availability SMS chase queued.";
    case "SENT":
      return "Availability SMS chase sent.";
    case "SKIPPED":
      return "Availability SMS chase skipped - check phone/preferences.";
    default:
      return "Availability SMS chase logged.";
  }
}

async function processSmsChaseNow() {
  try {
    await processNotificationQueue(10);
  } catch (error) {
    console.error("Failed to process availability SMS chase immediately", error);
  }
}

export async function updateFixtureAvailabilityAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const fixtureId = String(formData.get("fixtureId") ?? "").trim();
  const teamMemberId = String(formData.get("teamMemberId") ?? "").trim();
  const response = getResponseValue(formData.get("response"));
  const note = normaliseNullableString(formData.get("note"));

  await requireCaptain(teamid);

  if (!teamid || !fixtureId || !teamMemberId) {
    redirect("/captain");
  }

  const [fixture, membership, fee] = await Promise.all([
    prisma.fixture.findFirst({
      where: {
        id: fixtureId,
        ...publishedFixtureWhere,
        OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],
      },
      select: { id: true, kickoffAt: true },
    }),
    prisma.teamMember.findFirst({
      where: { id: teamMemberId, teamId: teamid },
      select: { id: true },
    }),
    prisma.playerMatchFee.findFirst({
      where: { fixtureId, teamMemberId, teamId: teamid },
      select: {
        id: true,
        status: true,
        amountPence: true,
        paidAt: true,
        note: true,
      },
    }),
  ]);

  if (!fixture) {
    redirect(
      buildAvailabilityRedirect(teamid, "?error=Fixture%20not%20found."),
    );
  }
  if (!membership) {
    redirect(
      buildAvailabilityRedirect(
        teamid,
        "?error=Team%20member%20not%20found.",
      ),
    );
  }

  await prisma.fixtureAvailability.upsert({
    where: {
      fixtureId_teamMemberId: { fixtureId, teamMemberId },
    },
    update: {
      response,
      note,
      respondedAt: response === "NO_RESPONSE" ? null : new Date(),
    },
    create: {
      fixtureId,
      teamMemberId,
      response,
      note,
      respondedAt: response === "NO_RESPONSE" ? null : new Date(),
    },
  });

  const fixtureStarted = fixture.kickoffAt.getTime() <= Date.now();
  let resultingFee = fee;
  let autoCancelled = false;

  if (
    !fixtureStarted &&
    response !== "AVAILABLE" &&
    fee &&
    (fee.status === "OPEN" || fee.status === "WAIVED")
  ) {
    resultingFee = await prisma.playerMatchFee.update({
      where: { id: fee.id },
      data: {
        status: "CANCELLED",
        paidAt: null,
        waivedAt: null,
        cancelledAt: new Date(),
        paymentUrl: null,
        paymentToken: null,
        note: appendNote({
          existingNote: fee.note,
          note: getAutomaticFeeCancellationNote(response),
        }),
      },
      select: {
        id: true,
        status: true,
        amountPence: true,
        paidAt: true,
        note: true,
      },
    });

    autoCancelled = true;
    await cancelQueuedPlayerMatchFeeNotificationDispatches(
      [fee.id],
      `Player availability changed to ${getResponseLabel(response)} before kickoff.`,
    );
  }

  revalidatePath(`/captain/team/${teamid}/availability`);
  revalidatePath(`/captain/team/${teamid}/fixtures`);
  revalidatePath(`/captain/team/${teamid}/fixtures/${fixtureId}/selection`);
  revalidatePath(`/captain/team/${teamid}/match-fees`);

  const savedMessage = getAvailabilitySavedMessage({
    response,
    fixtureStarted,
    autoCancelled,
    fee: resultingFee,
  });

  redirect(
    buildAvailabilityRedirect(
      teamid,
      `?saved=${encodeURIComponent(savedMessage)}#fixture-${fixtureId}`,
    ),
  );
}

export async function resetFixtureAvailabilityAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const fixtureId = String(formData.get("fixtureId") ?? "").trim();

  await requireCaptain(teamid);

  if (!teamid || !fixtureId) {
    redirect("/captain");
  }

  const [team, fixture] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamid },
      select: { id: true, members: { select: { id: true } } },
    }),
    prisma.fixture.findFirst({
      where: {
        id: fixtureId,
        ...publishedFixtureWhere,
        OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],
      },
      select: { id: true },
    }),
  ]);

  if (!team || !fixture) {
    redirect(
      buildAvailabilityRedirect(
        teamid,
        "?error=Fixture%20not%20found%20for%20this%20team.",
      ),
    );
  }

  const teamMemberIds = team.members.map((member) => member.id);
  const sourceIds = teamMemberIds.map((teamMemberId) =>
    getSmsSourceId({ fixtureId, teamMemberId }),
  );
  const archivedPrefix = `reset-${Date.now()}`;

  await prisma.$transaction([
    prisma.fixtureAvailability.deleteMany({
      where: { fixtureId, teamMemberId: { in: teamMemberIds } },
    }),
    sourceIds.length > 0
      ? prisma.$executeRaw(Prisma.sql`
          UPDATE "NotificationDispatch"
          SET
            "sourceId" = ${archivedPrefix} || ':' || "sourceId",
            "status" = CASE
              WHEN "status" IN ('QUEUED', 'PROCESSING') THEN 'CANCELLED'::"NotificationDispatchStatus"
              ELSE "status"
            END,
            "cancelledAt" = CASE
              WHEN "status" IN ('QUEUED', 'PROCESSING') THEN NOW()
              ELSE "cancelledAt"
            END,
            "failureReason" = COALESCE("failureReason", 'Archived because fixture availability was reset after postponement/rearrangement.')
          WHERE "sourceType" IN (${Prisma.join(AVAILABILITY_RESET_SOURCE_TYPES)})
            AND "sourceId" IN (${Prisma.join(sourceIds)})
        `)
      : prisma.$executeRaw(Prisma.sql`SELECT 1`),
  ]);

  revalidatePath(`/captain/team/${teamid}/availability`);
  revalidatePath(`/captain/team/${teamid}/availability/reset`);
  revalidatePath(`/captain/team/${teamid}/fixtures/${fixtureId}/selection`);

  redirect(
    buildAvailabilityRedirect(
      teamid,
      `?saved=fixture-availability-reset#fixture-${fixtureId}`,
    ),
  );
}

export async function sendAvailabilitySmsChaseAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const fixtureId = String(formData.get("fixtureId") ?? "").trim();
  const teamMemberId = String(formData.get("teamMemberId") ?? "").trim();
  const access = await requireCaptain(teamid);

  if (!teamid || !fixtureId || !teamMemberId) {
    redirect("/captain");
  }

  const fixture = await prisma.fixture.findFirst({
    where: {
      id: fixtureId,
      ...publishedFixtureWhere,
      OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],
    },
    select: {
      id: true,
      leagueId: true,
      kickoffAt: true,
      homeTeamId: true,
      awayTeamId: true,
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
      venue: { select: { name: true } },
    },
  });

  const member = await prisma.teamMember.findFirst({
    where: { id: teamMemberId, teamId: teamid },
    select: {
      id: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  if (!fixture || !member) {
    redirect(
      buildAvailabilityRedirect(
        teamid,
        "?error=Fixture%20or%20player%20not%20found.",
      ),
    );
  }

  const profiles = await getTeamMemberProfilesByTeamMemberIds([member.id]);
  const profile = profiles.get(member.id) ?? null;
  const phone = profile?.phone?.trim() || null;
  const normalizedPhone = normalizePhoneNumber(phone);

  if (!phone || !normalizedPhone) {
    redirect(
      buildAvailabilityRedirect(
        teamid,
        "?error=This%20player%20does%20not%20have%20a%20valid%20phone%20number.",
      ),
    );
  }

  const isHome = fixture.homeTeamId === teamid;
  const team = isHome ? fixture.homeTeam : fixture.awayTeam;
  const opponent = isHome ? fixture.awayTeam : fixture.homeTeam;
  const playerName = getPlayerDisplayName(member.user);
  const availabilityUrl = getAvailabilityUrl(teamid, fixture.id);
  const fixtureLabel = `${team.name} vs ${opponent.name} - ${formatFixtureDate(fixture.kickoffAt)}`;

  const recipient = await upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.GENERAL,
    sourceId: `team-member:${member.id}`,
    audience: NotificationAudience.PLAYER,
    displayName: playerName,
    email: member.user.email?.trim() || null,
    phone,
    marketingEmailOptIn: true,
    marketingSmsOptIn: true,
    transactionalEmailOptIn: true,
    transactionalSmsOptIn: true,
    metadata: {
      teamId: teamid,
      teamMemberId: member.id,
      userId: member.user.id,
      entityType: "TEAM_MEMBER",
    },
  });

  await prisma.notificationPreference.upsert({
    where: { recipientId: recipient.id },
    update: { smsEnabled: true, urgentSmsEnabled: true },
    create: {
      recipientId: recipient.id,
      emailEnabled: true,
      smsEnabled: true,
      urgentSmsEnabled: true,
    },
  });

  const dispatch = await queueDirectNotification({
    recipientId: recipient.id,
    channel: "SMS",
    audience: NotificationAudience.PLAYER,
    body: `SIXFL reminder: Hi ${getFirstName(playerName)}, please confirm your availability for ${fixtureLabel}. Update here: ${availabilityUrl}`,
    sourceType: AVAILABILITY_SMS_CHASE_SOURCE_TYPE,
    sourceId: getSmsSourceId({
      fixtureId: fixture.id,
      teamMemberId: member.id,
    }),
    metadata: {
      origin: "captain_availability_sms_chase",
      originLabel: "Availability SMS chase sent from captain availability page",
      teamId: teamid,
      fixtureId: fixture.id,
      teamMemberId: member.id,
      userId: member.user.id,
      leagueId: fixture.leagueId,
      availabilityUrl,
      fixtureLabel,
      venueName: fixture.venue?.name ?? null,
    },
    createdByUserId: access.user?.id ?? null,
  });

  await processSmsChaseNow();

  revalidatePath(`/captain/team/${teamid}/availability`);
  redirect(
    buildAvailabilityRedirect(
      teamid,
      `?saved=${encodeURIComponent(getSmsSavedMessage(dispatch.status))}`,
    ),
  );
}
