// ========================================
// File: src/app/captain/team/[teamid]/availability/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { NotificationAudience, NotificationRecipientSourceType, Prisma } from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { publishedFixtureWhere } from "@/lib/fixtures/publishing";
import { normalizePhoneNumber } from "@/lib/messaging/phone";
import { processNotificationQueue } from "@/lib/notifications/processor";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { queueDirectNotification } from "@/lib/notifications/service";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";

const ALLOWED_RESPONSES = ["AVAILABLE", "UNAVAILABLE", "MAYBE", "NO_RESPONSE"] as const;
type AvailabilityResponse = (typeof ALLOWED_RESPONSES)[number];

const AVAILABILITY_SMS_CHASE_SOURCE_TYPE = "CAPTAIN_AVAILABILITY_SMS_CHASE";
const AVAILABILITY_RESET_SOURCE_TYPES = [
  AVAILABILITY_SMS_CHASE_SOURCE_TYPE,
  "MANAGED_SQUAD_AVAILABILITY_REQUEST",
  "MANAGED_SQUAD_AVAILABILITY_CHASE_24H",
  "MANAGED_SQUAD_AVAILABILITY_CHASE_72H",
] as const;

function getResponseValue(value: FormDataEntryValue | null): AvailabilityResponse {
  const parsed = String(value ?? "").trim().toUpperCase();
  return ALLOWED_RESPONSES.includes(parsed as AvailabilityResponse) ? (parsed as AvailabilityResponse) : "NO_RESPONSE";
}

function normaliseNullableString(value: FormDataEntryValue | null) {
  const parsed = String(value ?? "").trim();
  return parsed ? parsed : null;
}

function buildAvailabilityRedirect(teamid: string, query: string) {
  return `/captain/team/${teamid}/availability${query}`;
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

function getPlayerDisplayName(input: { name: string | null; email: string | null }) {
  return input.name?.trim() || input.email?.trim() || "Player";
}

function getSmsSourceId(input: { fixtureId: string; teamMemberId: string }) {
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

  const [fixture, membership] = await Promise.all([
    prisma.fixture.findFirst({
      where: {
        id: fixtureId,
        ...publishedFixtureWhere,
        OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],
      },
      select: { id: true },
    }),
    prisma.teamMember.findFirst({
      where: { id: teamMemberId, teamId: teamid },
      select: { id: true },
    }),
  ]);

  if (!fixture) redirect(buildAvailabilityRedirect(teamid, "?error=Fixture%20not%20found."));
  if (!membership) redirect(buildAvailabilityRedirect(teamid, "?error=Team%20member%20not%20found."));

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

  revalidatePath(`/captain/team/${teamid}/availability`);
  revalidatePath(`/captain/team/${teamid}/fixtures`);
  revalidatePath(`/captain/team/${teamid}/fixtures/${fixtureId}/selection`);
  redirect(buildAvailabilityRedirect(teamid, "?saved=availability-updated"));
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
    redirect(buildAvailabilityRedirect(teamid, "?error=Fixture%20not%20found%20for%20this%20team."));
  }

  const teamMemberIds = team.members.map((member) => member.id);
  const sourceIds = teamMemberIds.map((teamMemberId) => getSmsSourceId({ fixtureId, teamMemberId }));
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

  redirect(buildAvailabilityRedirect(teamid, `?saved=fixture-availability-reset#fixture-${fixtureId}`));
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
    redirect(buildAvailabilityRedirect(teamid, "?error=Fixture%20or%20player%20not%20found."));
  }

  const profiles = await getTeamMemberProfilesByTeamMemberIds([member.id]);
  const profile = profiles.get(member.id) ?? null;
  const phone = profile?.phone?.trim() || null;
  const normalizedPhone = normalizePhoneNumber(phone);

  if (!phone || !normalizedPhone) {
    redirect(buildAvailabilityRedirect(teamid, "?error=This%20player%20does%20not%20have%20a%20valid%20phone%20number."));
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
    sourceId: getSmsSourceId({ fixtureId: fixture.id, teamMemberId: member.id }),
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
