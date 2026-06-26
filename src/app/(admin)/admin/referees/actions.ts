// ========================================
// File: src/app/(admin)/admin/referees/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  LeadStatus,
  NotificationAudience,
  NotificationChannel,
  NotificationDispatchStatus,
  NotificationRecipientSourceType,
  UserRole,
} from "@prisma/client";

import { recordOutboundSms } from "@/lib/messaging/service";
import { normalizePhoneNumber } from "@/lib/notifications/phone";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { queueDirectNotification } from "@/lib/notifications/service";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  parseMoneyToPence,
  upsertRefereeProfile,
} from "@/lib/referees/profile";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function normaliseEmail(value: string) {
  return value.toLowerCase().trim();
}

function getRefereesPath(query?: string) {
  return query ? `/admin/referees?${query}` : "/admin/referees";
}

function getRefereeProfilePath(refereeId: string, extras?: Record<string, string | number | boolean | null | undefined>, hash?: string) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(extras ?? {})) {
    if (value === null || value === undefined || value === false || value === "") continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  return `/admin/referees/${refereeId}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function readStandardNightFeePence(formData: FormData) {
  return parseMoneyToPence(readString(formData, "standardNightFee"));
}

async function syncRefereeRecipient(input: {
  userId: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  createdFromLeadId?: string | null;
  standardNightFeePence?: number | null;
}) {
  return upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.REFEREE,
    sourceId: input.userId,
    audience: NotificationAudience.REFEREE,
    displayName: input.name,
    email: input.email,
    phone: input.phone,
    transactionalEmailOptIn: true,
    transactionalSmsOptIn: true,
    marketingEmailOptIn: false,
    marketingSmsOptIn: false,
    metadata: {
      refereeUserId: input.userId,
      sourceLeadId: input.createdFromLeadId ?? null,
      standardNightFeePence: input.standardNightFeePence ?? 0,
    },
  });
}

export async function createRefereeAction(formData: FormData) {
  await requireAdmin();

  const name = readString(formData, "name");
  const email = normaliseEmail(readString(formData, "email"));
  const phone = readString(formData, "phone") || null;
  const area = readString(formData, "area") || null;
  const standardNightFeePence = readStandardNightFeePence(formData);
  const phoneNormalized = normalizePhoneNumber(phone);

  if (!name || !email) {
    redirect(getRefereesPath("error=missing_referee_details"));
  }

  if (!isValidEmail(email)) {
    redirect(getRefereesPath("error=invalid_referee_email"));
  }

  if (standardNightFeePence === null) {
    redirect(getRefereesPath("error=invalid_referee_fee"));
  }

  if (phone && !phoneNormalized) {
    redirect(getRefereesPath("error=invalid_referee_phone"));
  }

  const existingAdmin = await prisma.user.findFirst({
    where: { email, role: UserRole.ADMIN },
    select: { id: true },
  });

  if (existingAdmin) {
    redirect(getRefereesPath("error=admin_user_already_assignable"));
  }

  const result = await prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        role: true,
        createdFromLeadId: true,
      },
    });

    let leadId = existingUser?.createdFromLeadId ?? null;

    if (leadId) {
      await tx.interestLead.update({
        where: { id: leadId },
        data: {
          contactName: name,
          email,
          phone,
          phoneNormalized,
          area,
          interestType: "REFEREE",
          status: LeadStatus.CLOSED,
          contactedAt: new Date(),
          convertedAt: new Date(),
          closedAt: new Date(),
        },
      });
    } else {
      const lead = await tx.interestLead.create({
        data: {
          interestType: "REFEREE",
          status: LeadStatus.CLOSED,
          contactName: name,
          email,
          phone,
          phoneNormalized,
          area,
          source: "Admin added referee",
          message: "Manually added from the referee admin page.",
          contactedAt: new Date(),
          convertedAt: new Date(),
          closedAt: new Date(),
        },
        select: { id: true },
      });
      leadId = lead.id;
    }

    if (existingUser) {
      const updatedUser = await tx.user.update({
        where: { id: existingUser.id },
        data: {
          name: existingUser.name?.trim() ? existingUser.name : name,
          role: UserRole.REFEREE,
          createdFromLeadId: leadId,
        },
        select: { id: true, name: true, email: true, createdFromLeadId: true },
      });

      return { user: updatedUser, mode: "updated" };
    }

    const newUser = await tx.user.create({
      data: {
        name,
        email,
        role: UserRole.REFEREE,
        createdFromLeadId: leadId,
      },
      select: { id: true, name: true, email: true, createdFromLeadId: true },
    });

    return { user: newUser, mode: "created" };
  });

  await upsertRefereeProfile({
    userId: result.user.id,
    phone,
    standardNightFeePence,
    notes: null,
    isActive: true,
  });

  await syncRefereeRecipient({
    userId: result.user.id,
    name: result.user.name ?? name,
    email: result.user.email ?? email,
    phone,
    createdFromLeadId: result.user.createdFromLeadId,
    standardNightFeePence,
  });

  revalidatePath("/admin/referees");
  revalidatePath(`/admin/referees/${result.user.id}`);
  revalidatePath(`/admin/referees/${result.user.id}/preview`);
  revalidatePath("/admin/leads");

  redirect(getRefereesPath(`referee=${result.mode}&userId=${result.user.id}`));
}

export async function updateRefereeAction(formData: FormData) {
  await requireAdmin();

  const refereeId = readString(formData, "refereeId");
  const name = readString(formData, "name");
  const email = normaliseEmail(readString(formData, "email"));
  const phone = readString(formData, "phone") || null;
  const area = readString(formData, "area") || null;
  const notes = readString(formData, "notes") || null;
  const standardNightFeePence = readStandardNightFeePence(formData);
  const isActive = formData.get("isActive") === "on";
  const phoneNormalized = normalizePhoneNumber(phone);

  if (!refereeId) {
    redirect(getRefereesPath("error=missing_referee"));
  }

  if (!name || !email) {
    redirect(getRefereeProfilePath(refereeId, { error: "missing_referee_details" }));
  }

  if (!isValidEmail(email)) {
    redirect(getRefereeProfilePath(refereeId, { error: "invalid_referee_email" }));
  }

  if (standardNightFeePence === null) {
    redirect(getRefereeProfilePath(refereeId, { error: "invalid_referee_fee" }));
  }

  if (phone && !phoneNormalized) {
    redirect(getRefereeProfilePath(refereeId, { error: "invalid_referee_phone" }));
  }

  const existingReferee = await prisma.user.findUnique({
    where: { id: refereeId },
    select: { id: true, role: true, createdFromLeadId: true },
  });

  if (!existingReferee || existingReferee.role !== UserRole.REFEREE) {
    redirect(getRefereesPath("error=missing_referee"));
  }

  const emailOwner = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });

  if (emailOwner && emailOwner.id !== refereeId) {
    redirect(getRefereeProfilePath(refereeId, { error: "referee_email_in_use" }));
  }

  const updatedUser = await prisma.$transaction(async (tx) => {
    let leadId = existingReferee.createdFromLeadId ?? null;

    if (leadId) {
      await tx.interestLead.update({
        where: { id: leadId },
        data: {
          contactName: name,
          email,
          phone,
          phoneNormalized,
          area,
          interestType: "REFEREE",
        },
      });
    } else {
      const lead = await tx.interestLead.create({
        data: {
          interestType: "REFEREE",
          status: LeadStatus.CLOSED,
          contactName: name,
          email,
          phone,
          phoneNormalized,
          area,
          source: "Admin edited referee",
          message: "Referee profile created from the referee admin edit form.",
          contactedAt: new Date(),
          convertedAt: new Date(),
          closedAt: new Date(),
        },
        select: { id: true },
      });
      leadId = lead.id;
    }

    return tx.user.update({
      where: { id: refereeId },
      data: {
        name,
        email,
        role: UserRole.REFEREE,
        createdFromLeadId: leadId,
      },
      select: { id: true, name: true, email: true, createdFromLeadId: true },
    });
  });

  await upsertRefereeProfile({
    userId: updatedUser.id,
    phone,
    standardNightFeePence,
    notes,
    isActive,
  });

  await syncRefereeRecipient({
    userId: updatedUser.id,
    name: updatedUser.name,
    email: updatedUser.email,
    phone,
    createdFromLeadId: updatedUser.createdFromLeadId,
    standardNightFeePence,
  });

  revalidatePath("/admin/referees");
  revalidatePath(`/admin/referees/${updatedUser.id}`);
  revalidatePath(`/admin/referees/${updatedUser.id}/preview`);
  revalidatePath("/admin/leads");

  redirect(getRefereeProfilePath(updatedUser.id, { updated: 1 }));
}

export async function sendRefereeSmsAction(formData: FormData) {
  const { user: adminUser } = await requireAdmin();

  const refereeId = readString(formData, "refereeId");
  const body = String(formData.get("body") ?? "").trim();

  if (!refereeId) {
    redirect(getRefereesPath("error=missing_referee"));
  }

  if (!body) {
    redirect(getRefereeProfilePath(refereeId, { error: "empty_sms" }, "sms"));
  }

  const referee = await prisma.user.findUnique({
    where: { id: refereeId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdFromLeadId: true,
    },
  });

  if (!referee || referee.role !== UserRole.REFEREE) {
    redirect(getRefereesPath("error=missing_referee"));
  }

  const [profile, sourceLead] = await Promise.all([
    prisma.$queryRaw<Array<{ phone: string | null; standardNightFeePence: number }>>`
      SELECT "phone", "standardNightFeePence"
      FROM "RefereeProfile"
      WHERE "userId" = ${referee.id}
      LIMIT 1
    `.catch(() => []),
    referee.createdFromLeadId
      ? prisma.interestLead.findUnique({
          where: { id: referee.createdFromLeadId },
          select: { phone: true },
        })
      : null,
  ]);

  const phone = profile[0]?.phone || sourceLead?.phone || null;
  const phoneNormalized = normalizePhoneNumber(phone);

  if (!phoneNormalized) {
    redirect(getRefereeProfilePath(referee.id, { error: "missing_referee_phone" }, "sms"));
  }

  const recipient = await syncRefereeRecipient({
    userId: referee.id,
    name: referee.name,
    email: referee.email,
    phone: phoneNormalized,
    createdFromLeadId: referee.createdFromLeadId,
    standardNightFeePence: profile[0]?.standardNightFeePence ?? 0,
  });

  const dispatch = await queueDirectNotification({
    recipientId: recipient.id,
    channel: NotificationChannel.SMS,
    audience: NotificationAudience.REFEREE,
    body,
    sourceType: "REFEREE",
    sourceId: referee.id,
    metadata: {
      refereeUserId: referee.id,
      contactName: referee.name ?? null,
      manualRefereeSms: true,
    },
    createdByUserId: adminUser?.id ?? null,
  });

  if (dispatch.status !== NotificationDispatchStatus.QUEUED) {
    redirect(getRefereeProfilePath(referee.id, { error: "sms_not_queued" }, "sms"));
  }

  await recordOutboundSms({
    notificationDispatchId: dispatch.id,
    recipientId: recipient.id,
    sourceType: "REFEREE",
    sourceId: referee.id,
    contactName: referee.name,
    phone: phoneNormalized,
    body: dispatch.bodyText,
    toNumber: phoneNormalized,
    provider: "twilio",
    providerStatus: "queued",
    createdByUserId: adminUser?.id ?? null,
  });

  revalidatePath("/admin/referees");
  revalidatePath(`/admin/referees/${referee.id}`);
  revalidatePath("/admin/messaging");

  redirect(getRefereeProfilePath(referee.id, { sms: "queued" }, "sms"));
}
