import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ReviewAction = "confirm" | "request_change";

function statusFor(team: {
  kitBadgeConfirmedAt: Date | null;
  kitBadgeChangeRequestedAt: Date | null;
}) {
  if (team.kitBadgeChangeRequestedAt) return "CHANGE_REQUESTED" as const;
  if (team.kitBadgeConfirmedAt) return "CONFIRMED" as const;
  return "PENDING" as const;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const payload = (await request.json().catch(() => null)) as
    | { action?: unknown; note?: unknown }
    | null;
  const action = String(payload?.action ?? "") as ReviewAction;
  const note = String(payload?.note ?? "").trim().slice(0, 600);

  if (action !== "confirm" && action !== "request_change") {
    return NextResponse.json(
      { error: "Choose whether to keep the badge or request a change." },
      { status: 400 },
    );
  }

  if (action === "request_change" && !note) {
    return NextResponse.json(
      { error: "Tell SIXFL what you would like changed about the badge." },
      { status: 400 },
    );
  }

  const existing = await prisma.team.findUnique({
    where: { id: teamid },
    select: { id: true, logoUrl: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  if (action === "confirm" && !existing.logoUrl?.trim()) {
    return NextResponse.json(
      { error: "This team does not have a badge to approve yet." },
      { status: 400 },
    );
  }

  const now = new Date();
  const team = await prisma.team.update({
    where: { id: teamid },
    data:
      action === "confirm"
        ? {
            kitBadgeConfirmedAt: now,
            kitBadgeChangeRequestedAt: null,
            kitBadgeChangeRequestNote: null,
          }
        : {
            kitBadgeConfirmedAt: null,
            kitBadgeChangeRequestedAt: now,
            kitBadgeChangeRequestNote: note,
          },
    select: {
      id: true,
      logoUrl: true,
      kitBadgeConfirmedAt: true,
      kitBadgeChangeRequestedAt: true,
      kitBadgeChangeRequestNote: true,
    },
  });

  return NextResponse.json({
    status: statusFor(team),
    logoUrl: team.logoUrl,
    confirmedAt: team.kitBadgeConfirmedAt?.toISOString() ?? null,
    changeRequestedAt: team.kitBadgeChangeRequestedAt?.toISOString() ?? null,
    changeRequestNote: team.kitBadgeChangeRequestNote,
  });
}
