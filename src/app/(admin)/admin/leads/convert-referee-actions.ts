// ========================================
// File: src/app/admin/leads/convert-referee-actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { LeadStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import type { ConvertLeadToRefereeState } from "./convert-referee-action-state";

export async function convertLeadToRefereeAction(
  _prevState: ConvertLeadToRefereeState,
  formData: FormData
): Promise<ConvertLeadToRefereeState> {
  await requireAdmin();

  const leadId = String(formData.get("leadId") ?? "").trim();

  if (!leadId) {
    return {
      ok: false,
      error: "Missing lead id.",
    };
  }

  const lead = await prisma.interestLead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      interestType: true,
      contactName: true,
      email: true,
      convertedAt: true,
      closedAt: true,
    },
  });

  if (!lead) {
    return {
      ok: false,
      error: "Lead not found.",
    };
  }

  if (lead.interestType !== "REFEREE") {
    return {
      ok: false,
      error: "Only REFEREE leads can be converted into referees.",
    };
  }

  const email = lead.email?.trim().toLowerCase();

  if (!email) {
    return {
      ok: false,
      error: "This lead needs an email address before it can be converted.",
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const freshLead = await tx.interestLead.findUnique({
        where: { id: leadId },
        select: {
          id: true,
          interestType: true,
          contactName: true,
          email: true,
          convertedAt: true,
        },
      });

      if (!freshLead) {
        throw new Error("Lead not found.");
      }

      if (freshLead.interestType !== "REFEREE") {
        throw new Error("Only REFEREE leads can be converted into referees.");
      }

      const safeEmail = freshLead.email?.trim().toLowerCase();

      if (!safeEmail) {
        throw new Error(
          "This lead needs an email address before it can be converted."
        );
      }

      const existingUser = await tx.user.findUnique({
        where: { email: safeEmail },
        select: {
          id: true,
          name: true,
          role: true,
        },
      });

      if (existingUser) {
        const updatedUser = await tx.user.update({
          where: { id: existingUser.id },
          data: {
            name: existingUser.name?.trim()
              ? existingUser.name
              : freshLead.contactName?.trim() || null,
            role:
              existingUser.role === UserRole.ADMIN
                ? UserRole.ADMIN
                : UserRole.REFEREE,
            createdFromLeadId: existingUser.role === UserRole.ADMIN ? undefined : leadId,
          },
          select: {
            id: true,
          },
        });

        await tx.interestLead.update({
          where: { id: freshLead.id },
          data: {
            status: LeadStatus.CLOSED,
            contactedAt: freshLead.convertedAt ? undefined : new Date(),
            convertedAt: new Date(),
            closedAt: new Date(),
          },
        });

        return {
          userId: updatedUser.id,
        };
      }

      const newUser = await tx.user.create({
        data: {
          name: freshLead.contactName?.trim() || null,
          email: safeEmail,
          role: UserRole.REFEREE,
          createdFromLeadId: leadId,
        },
        select: {
          id: true,
        },
      });

      await tx.interestLead.update({
        where: { id: freshLead.id },
        data: {
          status: LeadStatus.CLOSED,
          contactedAt: freshLead.convertedAt ? undefined : new Date(),
          convertedAt: new Date(),
          closedAt: new Date(),
        },
      });

      return {
        userId: newUser.id,
      };
    });

    revalidatePath("/admin/leads");
    revalidatePath(`/admin/leads/${leadId}`);
    revalidatePath("/admin/fixtures");
    revalidatePath("/admin/referees");

    redirect(`/admin/leads/${leadId}?refereeConverted=1&userId=${result.userId}`);
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to convert lead to referee.",
    };
  }
}