"use server";

import {
  NotificationAudience,
  NotificationRecipientSourceType,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import {
  getPhoneDisplayValue,
  normalizePhoneNumber,
} from "@/lib/notifications/phone";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import {
  ensurePlayerPoolTables,
  getPlayerPoolBaseUrl,
  normalizePlayerPoolEmail,
  splitPlayerPoolName,
} from "@/lib/player-pool/storage";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

const PLAYER_POOL_PROFILE_INVITE_TEMPLATE_KEY =
  "player-pool-profile-invite-email";

type PlayerPoolEditRow = {
  profileId: string;
  prospectId: string;
  leadId: string | null;
  profileToken: string;
  publicCode: string;
  profileStatus: string;
  area: string | null;
  leagueId: string | null;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  leagueName: string | null;
};

function editPath(profileId: string, error: string) {
  return `/admin/player-pool/${encodeURIComponent(profileId)}/edit?error=${encodeURIComponent(
    error,
  )}`;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function fullName(firstName: string, lastName: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

async function loadProfile(profileId: string) {
  const rows = await prisma.$queryRaw<PlayerPoolEditRow[]>`
    SELECT
      profile."id" AS "profileId",
      profile."prospectId",
      profile."leadId",
      profile."profileToken",
      profile."publicCode",
      profile."status" AS "profileStatus",
      profile."area",
      profile."leagueId",
      prospect."firstName",
      prospect."lastName",
      prospect."email",
      prospect."phone",
      COALESCE(competition."name", league."name") AS "leagueName"
    FROM "PlayerPoolProfile" profile
    JOIN "TeamPlayerProspect" prospect ON prospect."id" = profile."prospectId"
    LEFT JOIN "League" league ON league."id" = profile."leagueId"
    LEFT JOIN "LeagueCompetition" competition
      ON competition."id" = league."competitionId"
    WHERE profile."id" = ${profileId}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function updatePlayerPoolDetailsAction(formData: FormData) {
  const { user } = await requireAdmin();
  await ensurePlayerPoolTables();

  const profileId = String(formData.get("profileId") ?? "").trim();
  const nameInput = String(formData.get("fullName") ?? "").trim();
  const email = normalizePlayerPoolEmail(formData.get("email"));
  const phoneInput = String(formData.get("phone") ?? "").trim();
  const area = String(formData.get("area") ?? "").trim() || null;
  const intent = String(formData.get("intent") ?? "save").trim();

  if (!profileId) {
    redirect("/admin/player-pool?error=PlayerPool%20profile%20not%20found.");
  }

  if (!nameInput) {
    redirect(editPath(profileId, "Enter the player's name."));
  }

  if (!email || !isValidEmail(email)) {
    redirect(editPath(profileId, "Enter a valid email address."));
  }

  const profile = await loadProfile(profileId);
  if (!profile) {
    redirect("/admin/player-pool?error=PlayerPool%20profile%20not%20found.");
  }

  const duplicateRows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "PlayerPoolProfile"
    WHERE LOWER(TRIM("emailNormalized")) = ${email}
      AND "id" <> ${profileId}
    LIMIT 1
  `;

  if (duplicateRows[0]) {
    redirect(
      editPath(
        profileId,
        "That email address already belongs to another PlayerPool profile.",
      ),
    );
  }

  const oldEmail = profile.email?.trim().toLowerCase() || null;
  const emailChanged = oldEmail !== email;
  const { firstName, lastName } = splitPlayerPoolName(nameInput);
  const displayName = fullName(firstName, lastName) || nameInput;
  const phoneDisplay = getPhoneDisplayValue(phoneInput);
  const phoneNormalized = normalizePhoneNumber(phoneInput);

  await prisma.$transaction(async (tx) => {
    await tx.teamPlayerProspect.update({
      where: { id: profile.prospectId },
      data: {
        firstName,
        lastName,
        email,
        phone: phoneInput || null,
      },
    });

    await tx.$executeRaw`
      UPDATE "PlayerPoolProfile"
      SET "emailNormalized" = ${email},
          "area" = ${area},
          "updatedAt" = NOW()
      WHERE "id" = ${profileId}
    `;

    if (profile.leadId) {
      await tx.interestLead.update({
        where: { id: profile.leadId },
        data: {
          contactName: displayName,
          email,
          phone: phoneInput || null,
        },
      });
    }
  });

  const profileRecipient = await upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.GENERAL,
    sourceId: `player-pool-profile:${profileId}`,
    audience: NotificationAudience.PLAYER,
    displayName,
    email,
    phone: phoneDisplay,
    transactionalEmailOptIn: true,
    transactionalSmsOptIn: true,
    marketingEmailOptIn: false,
    marketingSmsOptIn: false,
    metadata: {
      entityType: "PLAYER_POOL_PROFILE",
      profileId,
      prospectId: profile.prospectId,
      leadId: profile.leadId,
      publicCode: profile.publicCode,
      leagueId: profile.leagueId,
    },
  });

  const prospectRecipient = await upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.GENERAL,
    sourceId: `team-prospect:${profile.prospectId}`,
    audience: NotificationAudience.PLAYER,
    displayName,
    email,
    phone: phoneDisplay,
    transactionalEmailOptIn: true,
    transactionalSmsOptIn: true,
    marketingEmailOptIn: false,
    marketingSmsOptIn: false,
    metadata: {
      entityType: "UNASSIGNED_PLAYER_PROSPECT",
      profileId,
      prospectId: profile.prospectId,
      leadId: profile.leadId,
      publicCode: profile.publicCode,
      leagueId: profile.leagueId,
    },
  });

  const linkedRecipientRows = await prisma.notificationRecipient.findMany({
    where: {
      OR: [
        { id: { in: [profileRecipient.id, prospectRecipient.id] } },
        {
          sourceType: NotificationRecipientSourceType.GENERAL,
          sourceId: {
            in: [
              `player-pool-profile:${profileId}`,
              `team-prospect:${profile.prospectId}`,
            ],
          },
        },
        ...(profile.leadId
          ? [
              {
                sourceType: NotificationRecipientSourceType.LEAD,
                sourceId: profile.leadId,
              },
            ]
          : []),
        ...(oldEmail
          ? [
              {
                audience: NotificationAudience.PLAYER,
                emailNormalized: oldEmail,
              },
            ]
          : []),
      ],
    },
    select: { id: true },
  });

  const linkedRecipientIds = Array.from(
    new Set(linkedRecipientRows.map((recipient) => recipient.id)),
  );

  if (linkedRecipientIds.length > 0) {
    await prisma.notificationRecipient.updateMany({
      where: { id: { in: linkedRecipientIds } },
      data: {
        displayName,
        email,
        emailNormalized: email,
        phone: phoneDisplay,
        phoneNormalized,
        lastSyncedAt: new Date(),
        ...(emailChanged
          ? {
              isSuppressed: false,
              suppressionReason: null,
            }
          : {}),
      },
    });
  }

  const threadWhere = [
    ...(linkedRecipientIds.length > 0
      ? [{ recipientId: { in: linkedRecipientIds } }]
      : []),
    { sourceType: "TEAM_PLAYER_PROSPECT", sourceId: profile.prospectId },
    { sourceType: "PLAYER_POOL_PROFILE_INVITE", sourceId: profileId },
    ...(oldEmail ? [{ emailNormalized: oldEmail }] : []),
  ];

  await prisma.messageThread.updateMany({
    where: { OR: threadWhere },
    data: {
      contactName: displayName,
      contactEmail: email,
      emailNormalized: email,
      contactPhone: phoneInput || null,
      phoneNormalized,
    },
  });

  let inviteSent = false;

  if (intent === "save-and-resend") {
    const profileUrl = `${getPlayerPoolBaseUrl()}/player-pool/profile/${profile.profileToken}`;
    const dispatch = await queueNotificationFromTemplate({
      templateKey: PLAYER_POOL_PROFILE_INVITE_TEMPLATE_KEY,
      recipientId: profileRecipient.id,
      variables: {
        firstName: firstName || "there",
        fullName: displayName,
        profileUrl,
        publicCode: profile.publicCode,
        area: area || "",
        leagueName: profile.leagueName || "SIXFL PlayerPool",
      },
      sourceType: "PLAYER_POOL_PROFILE_INVITE",
      sourceId: profileId,
      metadata: {
        origin: "player_pool_details_correction",
        originLabel: "PlayerPool invitation resent after contact details were corrected",
        profileId,
        prospectId: profile.prospectId,
        leadId: profile.leadId,
        publicCode: profile.publicCode,
        leagueId: profile.leagueId,
        previousEmail: oldEmail,
        correctedEmail: email,
        ctaUrl: profileUrl,
      },
      createdByUserId: user?.id ?? null,
    });

    await logNotificationDispatchToThread({
      dispatch,
      recipient: profileRecipient,
    });

    await prisma.$executeRaw`
      UPDATE "PlayerPoolProfile"
      SET "invitedAt" = NOW(),
          "updatedAt" = NOW()
      WHERE "id" = ${profileId}
    `;

    inviteSent = true;
  }

  revalidatePath("/admin/player-pool");
  revalidatePath(`/admin/player-pool/${profileId}/edit`);
  revalidatePath(`/player-pool/profile/${profile.profileToken}`);
  revalidatePath(`/admin/player-prospects/${profile.prospectId}/communications`);
  revalidatePath("/admin/player-prospects");
  revalidatePath("/admin/delivery-issues");
  revalidatePath("/admin/messaging");
  revalidatePath("/admin/queue");

  redirect(
    `/admin/player-pool?saved=${
      inviteSent ? "details-updated-invite-sent" : "details-updated"
    }`,
  );
}
