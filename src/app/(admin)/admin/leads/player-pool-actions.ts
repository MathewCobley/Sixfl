// ========================================
// File: src/app/(admin)/admin/leads/player-pool-actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

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

function buildLeadRedirect(leadId: string, error: string) {
  const query = new URLSearchParams({ playerPoolError: error });
  return `/admin/leads/${leadId}?${query.toString()}`;
}

export async function convertLeadToPlayerPoolAction(formData: FormData) {
  await requireAdmin();

  const leadId = String(formData.get("leadId") ?? "").trim();
  const extraNotes = String(formData.get("notes") ?? "").trim();

  if (!leadId) {
    redirect("/admin/leads");
  }

  let prospectId = "";
  let existingProspect = false;

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
        leagueType: true,
        message: true,
        source: true,
        convertedAt: true,
        preferredNights: {
          orderBy: { createdAt: "asc" },
          select: { night: true },
        },
      },
    });

    if (!lead) {
      redirect("/admin/leads");
    }

    if (lead.interestType !== "PLAYER") {
      throw new Error("Only player leads can be added to the player pool.");
    }

    const email = lead.email?.trim().toLowerCase() || null;
    const phone = lead.phone?.trim() || null;
    const duplicateWhere = [
      ...(email
        ? [
            {
              email: {
                equals: email,
                mode: "insensitive" as const,
              },
            },
          ]
        : []),
      ...(phone ? [{ phone }] : []),
    ];

    const matchingProspect = duplicateWhere.length
      ? await prisma.teamPlayerProspect.findFirst({
          where: { OR: duplicateWhere },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            teamId: true,
            status: true,
            team: { select: { name: true } },
          },
        })
      : null;

    if (matchingProspect?.teamId || matchingProspect?.status === "ACTIVE_SQUAD") {
      throw new Error(
        matchingProspect.team?.name
          ? `This player already has a squad record under ${matchingProspect.team.name}.`
          : "This player already has an active squad record.",
      );
    }

    const preferredNightSummary =
      lead.preferredNights.length > 0
        ? lead.preferredNights.map((entry) => entry.night).join(", ")
        : null;
    const { firstName, lastName } = splitLeadName(lead.contactName);
    const source = ["LEAD_PLAYER_POOL", lead.source?.trim() || null]
      .filter((value): value is string => Boolean(value))
      .join(" • ");
    const generatedNotes = [
      extraNotes || null,
      lead.message?.trim() ? `Lead message: ${lead.message.trim()}` : null,
      lead.area?.trim() ? `Area: ${lead.area.trim()}` : null,
      lead.leagueType ? `League type: ${lead.leagueType}` : null,
      preferredNightSummary ? `Preferred nights: ${preferredNightSummary}` : null,
      `Source lead ID: ${lead.id}`,
    ]
      .filter((value): value is string => Boolean(value))
      .join("\n\n");

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
              availabilitySummary: preferredNightSummary,
              source,
              status:
                matchingProspect.status === "DECLINED" || matchingProspect.status === "DUPLICATE"
                  ? "NEW"
                  : matchingProspect.status,
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
              availabilitySummary: preferredNightSummary,
              source,
              status: "NEW",
              notes: generatedNotes || null,
            },
            select: { id: true },
          });

      await tx.interestLead.update({
        where: { id: lead.id },
        data: {
          status: "CLOSED",
          contactedAt: lead.status === "NEW" ? new Date() : undefined,
          convertedAt: lead.convertedAt ?? new Date(),
          closedAt: new Date(),
        },
      });

      return prospect;
    });

    prospectId = result.id;
    existingProspect = Boolean(matchingProspect);
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "The player could not be added to the player pool.";

    console.error("Player-pool lead conversion failed", { leadId, error });
    redirect(buildLeadRedirect(leadId, message));
  }

  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/player-prospects");

  const query = new URLSearchParams({
    saved: existingProspect ? "lead-pool-reused" : "lead-pool-added",
    prospect: prospectId,
  });

  redirect(`/admin/player-prospects?${query.toString()}`);
}
