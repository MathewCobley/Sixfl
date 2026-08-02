import { NextResponse } from "next/server";

import { getSquadMemberCreationDetailsMap } from "@/lib/admin/squadMemberCreationDetails";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function humaniseSource(value: string | null) {
  const source = value?.trim();
  if (!source) return "player registration";

  const key = source.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const known: Record<string, string> = {
    PLAYER_POOL: "Player Pool",
    PLAYERPOOL: "Player Pool",
    REGISTER_INTEREST: "player registration",
    REGISTRATION: "player registration",
    WEBSITE: "website enquiry",
    MANUAL: "manual entry",
    ADMIN: "admin entry",
  };

  return known[key] ?? source.replaceAll("_", " ").replaceAll("-", " ");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  const access = await requireCaptain(teamid);

  if (!access.isAdmin) {
    return NextResponse.json(
      { error: "Only SIXFL admins can view squad creation details." },
      { status: 403 },
    );
  }

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      members: {
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          role: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  const detailsMap = await getSquadMemberCreationDetailsMap({
    teamId: team.id,
    members: team.members,
  });

  const membershipIds = team.members.map((member) => member.id);
  const profileRows = membershipIds.length
    ? await prisma.$queryRaw<Array<{ teamMemberId: string; notes: string | null }>>`
        SELECT "teamMemberId", "notes"
        FROM "TeamMemberProfile"
        WHERE "teamMemberId" = ANY(${membershipIds})
      `
    : [];

  const leadIdByMembershipId = new Map<string, string>();
  for (const profile of profileRows) {
    const leadId = profile.notes?.match(/Source lead ID:\s*([A-Za-z0-9_-]+)/i)?.[1];
    if (leadId) leadIdByMembershipId.set(profile.teamMemberId, leadId);
  }

  const leadIds = Array.from(new Set(leadIdByMembershipId.values()));
  const leads = leadIds.length
    ? await prisma.interestLead.findMany({
        where: { id: { in: leadIds } },
        select: {
          id: true,
          source: true,
          contactName: true,
          createdAt: true,
        },
      })
    : [];
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));

  for (const [membershipId, leadId] of leadIdByMembershipId) {
    const lead = leadById.get(leadId);
    if (!lead) continue;

    detailsMap.set(membershipId, {
      method: "Created from a player registration lead",
      createdBy: "SIXFL lead conversion · individual creator was not recorded",
      detail: `Original source: ${humaniseSource(lead.source)} · Source lead: ${lead.contactName}`,
      sourceRecordHref: `/admin/leads/${lead.id}`,
      inferred: false,
    });
  }

  return NextResponse.json({
    details: Object.fromEntries(detailsMap.entries()),
  });
}
