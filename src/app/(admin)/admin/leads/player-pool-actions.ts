// ========================================
// File: src/app/(admin)/admin/leads/player-pool-actions.ts
// ========================================

"use server";

import {
  NotificationAudience,
  NotificationRecipientSourceType,
  Prisma,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import {
  PLAYER_POOL_PROFILE_STATUSES,
  createPlayerPoolId,
  createPlayerPoolPublicCode,
  createPlayerPoolToken,
  ensurePlayerPoolTables,
  getPlayerPoolBaseUrl,
  normalizePlayerPoolEmail,
} from "@/lib/player-pool/storage";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

const PLAYER_POOL_PROFILE_INVITE_TEMPLATE_KEY =
  "player-pool-profile-invite-email";

type ExistingProfileRow = {
  id: string;
  prospectId: string;
  profileToken: string;
  publicCode: string;
  status: string;
};

type MatchingProspect = {
  id: string;
  teamId: string | null;
  status: string;
  team: { name: string } | null;
};

function splitLeadName(fullName: string | null | undefined) {
  const raw = fullName?.trim() ?? "";
  const parts = raw.split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return { firstName: "Player", lastName: null as string | null };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null as string | null };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function fullName(firstName: string, lastName: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function buildPlayerPoolErrorRedirect(error: string) {
  const query = new URLSearchParams({ error });
  return `/admin/player-pool?${query.toString()}`;
}

export async function convertLeadToPlayerPoolAction(formData: FormData) {
  const { user } = await requireAdmin();
  await ensurePlayerPoolTables();

  const leadId = String(formData.get("leadId") ?? "").trim();
  const extraNotes = String(formData.get("notes") ?? "").trim();

  if (!leadId) {
    redirect("/admin/leads");
  }

  try {
    const lead = await prisma.interestLead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        interestType: true,
        status: true,
        contactName: true,
        email: true,
        phone: true,
        area: true,
        leagueId: true,
        leagueType: true,
        message: true,
        source: true,
        convertedAt: true,
        league: {
          select: {
            name: true,
          },
        },
        preferredNights: {
          orderBy: { createdAt: "asc" },
          select: { night: true },
        },
      },
    });

    if (!lead) {
      throw new Error("Player lead not found.");
    }

    if (lead.interestType !== "PLAYER") {
      throw new Error("Only player leads can be added to the player pool.");
    }

    if (!lead.email?.trim()) {
      throw new Error(
        "This player needs an email address before they can be added to the PlayerPool and sent a profile invitation.",
      );
    }

    const email = normalizePlayerPoolEmail(lead.email);
    const phone = lead.phone?.trim() || null;
    const { firstName, lastName } = splitLeadName(lead.contactName);
    const preferredNights = lead.preferredNights.map((entry) => entry.night);
    const preferredNightSummary =
      preferredNights.length > 0 ? preferredNights.join(", ") : null;

    const existingProfileRows = await prisma.$queryRaw<ExistingProfileRow[]>`
      SELECT "id", "prospectId", "profileToken", "publicCode", "status"
      FROM "PlayerPoolProfile"
      WHERE "emailNormalized" = ${email}
      LIMIT 1
    `;
    const existingProfile = existingProfileRows[0] ?? null;

    let matchingProspect: MatchingProspect | null = null;

    if (existingProfile?.prospectId) {
      matchingProspect = await prisma.teamPlayerProspect.findUnique({
        where: { id: existingProfile.prospectId },
        select: {
          id: true,
          teamId: true,
          status: true,
          team: { select: { name: true } },
        },
      });
    }

    if (!matchingProspect) {
      const duplicateWhere = [
        {
          email: {
            equals: email,
            mode: "insensitive" as const,
          },
        },
        ...(phone ? [{ phone }] : []),
      ];

      matchingProspect = await prisma.teamPlayerProspect.findFirst({
        where: { OR: duplicateWhere },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          teamId: true,
          status: true,
          team: { select: { name: true } },
        },
      });
    }

    if (matchingProspect?.teamId || matchingProspect?.status === "ACTIVE_SQUAD") {
      throw new Error(
        matchingProspect.team?.name
          ? `This player already has a squad record under ${matchingProspect.team.name}.`
          : "This player already has an active squad record.",
      );
    }

    const source = ["SIXFL PlayerPool", lead.source?.trim() || null]
      .filter((value): value is string => Boolean(value))
      .join(" • ");
    const generatedNotes = [
      extraNotes || null,
      lead.message?.trim() ? `Lead message: ${lead.message.trim()}` : null,
      lead.area?.trim() ? `Area: ${lead.area.trim()}` : null,
      lead.leagueType ? `League type: ${lead.leagueType}` : null,
      preferredNightSummary
        ? `Preferred nights: ${preferredNightSummary}`
        : null,
      `Source lead ID: ${lead.id}`,
    ]
      .filter((value): value is string => Boolean(value))
      .join("\n\n");

    const profileId = existingProfile?.id ?? createPlayerPoolId();
    const profileToken =
      existingProfile?.profileToken ?? createPlayerPoolToken();
    const publicCode =
      existingProfile?.publicCode ?? createPlayerPoolPublicCode();
    const nextProfileStatus =
      existingProfile?.status === PLAYER_POOL_PROFILE_STATUSES.AVAILABLE
        ? PLAYER_POOL_PROFILE_STATUSES.AVAILABLE
        : PLAYER_POOL_PROFILE_STATUSES.INVITED;

    const result = await prisma.$transaction(async (tx) => {
      const prospect = matchingProspect
        ? await tx.teamPlayerProspect.update({
            where: { id: matchingProspect.id },
            data: {
              teamId: null,
              firstName,
              lastName,
              email,
              phone,
              preferredNights: preferredNights.length
                ? (preferredNights as Prisma.InputJsonValue)
                : undefined,
              availabilitySummary: preferredNightSummary,
              source,
              status:
                nextProfileStatus === PLAYER_POOL_PROFILE_STATUSES.AVAILABLE
                  ? matchingProspect.status
                  : PLAYER_POOL_PROFILE_STATUSES.INVITED,
              notes: generatedNotes || null,
            },
            select: { id: true },
          })
        : await tx.teamPlayerProspect.create({
            data: {
              teamId: null,
              firstName,
              lastName,
              email,
              phone,
              preferredNights: preferredNights.length
                ? (preferredNights as Prisma.InputJsonValue)
                : undefined,
              availabilitySummary: preferredNightSummary,
              source,
              status: PLAYER_POOL_PROFILE_STATUSES.INVITED,
              notes: generatedNotes || null,
            },
            select: { id: true },
          });

      await tx.$executeRaw`
        INSERT INTO "PlayerPoolProfile" (
          "id", "prospectId", "leadId", "profileToken", "publicCode",
          "emailNormalized", "area", "leagueId", "status",
          "invitedAt", "createdAt", "updatedAt"
        ) VALUES (
          ${profileId}, ${prospect.id}, ${lead.id}, ${profileToken}, ${publicCode},
          ${email}, ${lead.area}, ${lead.leagueId}, ${nextProfileStatus},
          NOW(), NOW(), NOW()
        )
        ON CONFLICT ("prospectId") DO UPDATE SET
          "leadId" = EXCLUDED."leadId",
          "emailNormalized" = EXCLUDED."emailNormalized",
          "area" = COALESCE(EXCLUDED."area", "PlayerPoolProfile"."area"),
          "leagueId" = COALESCE(EXCLUDED."leagueId", "PlayerPoolProfile"."leagueId"),
          "status" = CASE
            WHEN "PlayerPoolProfile"."status" = ${PLAYER_POOL_PROFILE_STATUSES.AVAILABLE}
              THEN "PlayerPoolProfile"."status"
            ELSE ${PLAYER_POOL_PROFILE_STATUSES.INVITED}
          END,
          "invitedAt" = NOW(),
          "updatedAt" = NOW()
      `;

      return prospect;
    });

    const profileUrl = `${getPlayerPoolBaseUrl()}/player-pool/profile/${profileToken}`;
    const displayName =
      lead.contactName?.trim() || fullName(firstName, lastName) || email;
    const recipient = await upsertNotificationRecipient({
      sourceType: NotificationRecipientSourceType.GENERAL,
      sourceId: `player-pool-profile:${profileId}`,
      audience: NotificationAudience.PLAYER,
      displayName,
      email,
      phone,
      transactionalEmailOptIn: true,
      transactionalSmsOptIn: true,
      marketingEmailOptIn: false,
      marketingSmsOptIn: false,
      metadata: {
        entityType: "PLAYER_POOL_PROFILE",
        profileId,
        prospectId: result.id,
        leadId: lead.id,
        publicCode,
        leagueId: lead.leagueId,
      },
    });

    const dispatch = await queueNotificationFromTemplate({
      templateKey: PLAYER_POOL_PROFILE_INVITE_TEMPLATE_KEY,
      recipientId: recipient.id,
      variables: {
        firstName: firstName || "there",
        fullName: displayName,
        profileUrl,
        publicCode,
        area: lead.area || "",
        leagueName: lead.league?.name || "SIXFL PlayerPool",
      },
      sourceType: "PLAYER_POOL_PROFILE_INVITE",
      sourceId: profileId,
      metadata: {
        origin: "lead_to_player_pool",
        originLabel: "Player lead added to PlayerPool and invitation sent",
        profileId,
        prospectId: result.id,
        leadId: lead.id,
        publicCode,
        leagueId: lead.leagueId,
        ctaUrl: profileUrl,
      },
      createdByUserId: user?.id ?? null,
    });

    await logNotificationDispatchToThread({ dispatch, recipient });

    await prisma.interestLead.update({
      where: { id: lead.id },
      data: {
        status: "CLOSED",
        contactedAt: lead.status === "NEW" ? new Date() : undefined,
        convertedAt: lead.convertedAt ?? new Date(),
        closedAt: new Date(),
      },
    });

    revalidatePath("/admin/leads");
    revalidatePath(`/admin/leads/${lead.id}`);
    revalidatePath("/admin/player-prospects");
    revalidatePath("/admin/player-pool");
    revalidatePath("/admin/templates");
    revalidatePath("/admin/messaging");
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "The player could not be added to the PlayerPool or sent their invitation email.";

    console.error("Player-pool lead conversion failed", { leadId, error });
    redirect(buildPlayerPoolErrorRedirect(message));
  }

  redirect("/admin/player-pool?saved=invite-sent");
}
