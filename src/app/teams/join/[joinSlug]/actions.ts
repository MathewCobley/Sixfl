// ========================================
// File: src/app/teams/join/[joinSlug]/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { NotificationAudience, NotificationChannel } from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import { queueDirectNotification } from "@/lib/notifications/service";

function normaliseNullableString(value: FormDataEntryValue | null) {
  const parsed = String(value ?? "").trim();
  return parsed ? parsed : null;
}

function buildRedirect(joinSlug: string, query: string) {
  return `/teams/join/${joinSlug}${query}`;
}

function normaliseNightValues(values: FormDataEntryValue[]) {
  return values
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function buildAvailabilitySummary(
  availabilityLevel: string | null,
  preferredNights: string[],
) {
  const parts: string[] = [];

  if (availabilityLevel) {
    parts.push(`Availability: ${availabilityLevel}`);
  }

  if (preferredNights.length > 0) {
    parts.push(`Preferred nights: ${preferredNights.join(", ")}`);
  }

  return parts.length > 0 ? parts.join(" | ") : null;
}

function getProspectDisplayName(input: {
  firstName: string;
  lastName: string | null;
}) {
  return [input.firstName, input.lastName].filter(Boolean).join(" ").trim();
}

function getDisplayValue(value: string | null) {
  return value?.trim() ? value.trim() : "—";
}

function mergeExistingProspectNotes(input: {
  existingNotes: string | null;
  publicNotes: string | null;
}) {
  if (!input.publicNotes) {
    return input.existingNotes;
  }

  const stamp = formatDateTimeInLondon(new Date(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const publicEntry = `Public form note (${stamp}): ${input.publicNotes}`;

  if (!input.existingNotes?.trim()) {
    return publicEntry;
  }

  return `${input.existingNotes.trim()}\n\n${publicEntry}`;
}

function buildProspectAlertBody(input: {
  teamName: string;
  joinSlug: string | null;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  ageBand: string | null;
  preferredPositions: string | null;
  experienceSummary: string | null;
  availabilityLevel: string | null;
  preferredNights: string[];
  availabilitySummary: string | null;
  notes: string | null;
  eventLabel: string;
}) {
  const prospectName =
    getProspectDisplayName({
      firstName: input.firstName,
      lastName: input.lastName,
    }) || input.firstName;
  const joinUrl = input.joinSlug
    ? `${process.env.NEXTAUTH_URL ?? "https://www.sixfl.co.uk"}/teams/join/${input.joinSlug}`
    : null;

  return [
    `${input.eventLabel} for ${input.teamName}.`,
    "",
    `Name: ${prospectName}`,
    `Email: ${getDisplayValue(input.email)}`,
    `Mobile: ${getDisplayValue(input.phone)}`,
    `Age band: ${getDisplayValue(input.ageBand)}`,
    `Preferred position: ${getDisplayValue(input.preferredPositions)}`,
    `Experience: ${getDisplayValue(input.experienceSummary)}`,
    `Availability level: ${getDisplayValue(input.availabilityLevel)}`,
    `Preferred nights: ${input.preferredNights.length ? input.preferredNights.join(", ") : "—"}`,
    `Availability summary: ${getDisplayValue(input.availabilitySummary)}`,
    `Player note: ${getDisplayValue(input.notes)}`,
    "Source: public-join-page",
    ...(joinUrl ? ["", `Join page: ${joinUrl}`] : []),
    "",
    "You can review this prospect in the team prospects pipeline.",
  ].join("\n");
}

export async function submitTeamJoinProspectAction(formData: FormData) {
  const joinSlug = String(formData.get("joinSlug") ?? "").trim();

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = normaliseNullableString(formData.get("lastName"));
  const email = normaliseNullableString(formData.get("email"))?.toLowerCase() ?? null;
  const phone = normaliseNullableString(formData.get("phone"));
  const ageBand = normaliseNullableString(formData.get("ageBand"));
  const preferredPositions = normaliseNullableString(
    formData.get("preferredPositions"),
  );
  const experienceSummary = normaliseNullableString(
    formData.get("experienceSummary"),
  );
  const availabilityLevel = normaliseNullableString(
    formData.get("availabilityLevel"),
  );
  const preferredNights = normaliseNightValues(formData.getAll("preferredNights"));
  const availabilitySummary = buildAvailabilitySummary(
    availabilityLevel,
    preferredNights,
  );
  const notes = normaliseNullableString(formData.get("notes"));

  if (!joinSlug) {
    redirect("/teams");
  }

  const team = await prisma.team.findFirst({
    where: {
      joinSlug,
      teamMode: "MANAGED",
      isRecruiting: true,
    },
    select: {
      id: true,
      name: true,
      joinSlug: true,
    },
  });

  if (!team) {
    redirect(buildRedirect(joinSlug, "?error=This%20team%20is%20not%20currently%20accepting%20player%20interest."));
  }

  if (!firstName) {
    redirect(buildRedirect(joinSlug, "?error=First%20name%20is%20required."));
  }

  const existing = await prisma.teamPlayerProspect.findFirst({
    where: {
      teamId: team.id,
      OR: [
        ...(email ? [{ email }] : []),
        ...(phone ? [{ phone }] : []),
      ],
    },
    select: {
      id: true,
      status: true,
      notes: true,
      source: true,
    },
  });

  const eventLabel = existing
    ? "An existing prospect has completed their player details form"
    : "A new player prospect has registered interest";

  const prospect = existing
    ? await prisma.teamPlayerProspect.update({
        where: { id: existing.id },
        data: {
          firstName,
          lastName,
          email,
          phone,
          ageBand,
          preferredPositions,
          experienceSummary,
          availabilityLevel,
          preferredNights,
          availabilitySummary,
          notes: mergeExistingProspectNotes({
            existingNotes: existing.notes,
            publicNotes: notes,
          }),
          source: existing.source ?? "public-join-page",
        },
      })
    : await prisma.teamPlayerProspect.create({
        data: {
          teamId: team.id,
          firstName,
          lastName,
          email,
          phone,
          ageBand,
          preferredPositions,
          experienceSummary,
          availabilityLevel,
          preferredNights,
          availabilitySummary,
          notes,
          source: "public-join-page",
          status: "NEW",
        },
      });

  try {
    const { recipient } = await upsertTeamNotificationRecipient(team.id);

    if (recipient.email?.trim()) {
      const prospectName = getProspectDisplayName({ firstName, lastName }) || firstName;

      await queueDirectNotification({
        recipientId: recipient.id,
        channel: NotificationChannel.EMAIL,
        audience: NotificationAudience.TEAM,
        subject: existing
          ? `Prospect details completed for ${team.name}: ${prospectName}`
          : `New prospect for ${team.name}: ${prospectName}`,
        body: buildProspectAlertBody({
          teamName: team.name,
          joinSlug: team.joinSlug,
          firstName,
          lastName,
          email,
          phone,
          ageBand,
          preferredPositions,
          experienceSummary,
          availabilityLevel,
          preferredNights,
          availabilitySummary,
          notes,
          eventLabel,
        }),
        isTransactional: true,
        sourceType: "TEAM_PLAYER_PROSPECT",
        sourceId: prospect.id,
        metadata: {
          origin: existing
            ? "public_team_join_existing_prospect_completed"
            : "public_team_join_prospect_alert",
          originLabel: existing
            ? "Existing prospect completed public details form"
            : "New public prospect alert",
          teamId: team.id,
          prospectId: prospect.id,
          joinSlug: team.joinSlug,
          prospectName,
        },
      });
    }
  } catch {}

  revalidatePath(`/teams/join/${joinSlug}`);
  revalidatePath(`/captain/team/${team.id}/prospects`);
  revalidatePath(`/admin/teams/${team.id}/prospects`);
  revalidatePath(`/admin/teams/${team.id}`);
  redirect(buildRedirect(joinSlug, existing ? "?saved=details-completed" : "?saved=1"));
}
