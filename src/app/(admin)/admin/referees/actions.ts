// ========================================
// File: src/app/(admin)/admin/referees/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { LeadStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function normaliseEmail(value: string) {
  return value.toLowerCase().trim();
}

function getRefereesPath(query?: string) {
  return query ? `/admin/referees?${query}` : "/admin/referees";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function createConvertedRefereeLead(input: {
  name: string;
  email: string;
  phone: string | null;
  area: string | null;
}) {
  return prisma.interestLead.create({
    data: {
      interestType: "REFEREE",
      status: LeadStatus.CLOSED,
      contactName: input.name,
      email: input.email,
      phone: input.phone,
      area: input.area,
      source: "Admin added referee",
      message: "Manually added from the referee admin page.",
      contactedAt: new Date(),
      convertedAt: new Date(),
      closedAt: new Date(),
    },
    select: { id: true },
  });
}

export async function createRefereeAction(formData: FormData) {
  await requireAdmin();

  const name = readString(formData, "name");
  const email = normaliseEmail(readString(formData, "email"));
  const phone = readString(formData, "phone") || null;
  const area = readString(formData, "area") || null;

  if (!name || !email) {
    redirect(getRefereesPath("error=missing_referee_details"));
  }

  if (!isValidEmail(email)) {
    redirect(getRefereesPath("error=invalid_referee_email"));
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

    if (existingUser?.role === UserRole.ADMIN) {
      throw new Error("That email belongs to an admin user. Admin users can already be assigned to referee nights.");
    }

    let leadId = existingUser?.createdFromLeadId ?? null;

    if (leadId) {
      await tx.interestLead.update({
        where: { id: leadId },
        data: {
          contactName: name,
          email,
          phone,
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
        select: { id: true },
      });

      return { userId: updatedUser.id, mode: "updated" };
    }

    const newUser = await tx.user.create({
      data: {
        name,
        email,
        role: UserRole.REFEREE,
        createdFromLeadId: leadId,
      },
      select: { id: true },
    });

    return { userId: newUser.id, mode: "created" };
  });

  revalidatePath("/admin/referees");
  revalidatePath(`/admin/referees/${result.userId}`);
  revalidatePath(`/admin/referees/${result.userId}/preview`);
  revalidatePath("/admin/leads");

  redirect(getRefereesPath(`referee=${result.mode}&userId=${result.userId}`));
}
