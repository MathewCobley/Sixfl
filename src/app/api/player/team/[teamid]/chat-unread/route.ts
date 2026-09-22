import { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/auth";
import { getPortalChatUnreadCount } from "@/lib/portal-messaging";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  const session = await getServerSession(authOptions).catch(() => null);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email.trim().toLowerCase() },
    select: {
      id: true,
      role: true,
      teamMembers: {
        where: { teamId: teamid },
        select: { id: true, userId: true, role: true },
        take: 1,
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Account not found." }, { status: 401 });
  }

  const url = new URL(request.url);
  const previewMembershipId =
    user.role === UserRole.ADMIN
      ? url.searchParams.get("previewMembershipId")?.trim() || null
      : null;

  const previewMembership = previewMembershipId
    ? await prisma.teamMember.findFirst({
        where: { id: previewMembershipId, teamId: teamid },
        select: { id: true, userId: true, role: true },
      })
    : null;

  if (previewMembershipId && !previewMembership) {
    return NextResponse.json(
      { error: "That player preview is not linked to this team." },
      { status: 404 },
    );
  }

  const membership = previewMembership ?? user.teamMembers[0] ?? null;
  if (!membership) {
    return NextResponse.json({ unreadCount: 0 });
  }

  const unreadCount = await getPortalChatUnreadCount({
    teamId: teamid,
    userId: membership.userId,
    role: membership.role,
  });

  return NextResponse.json({ unreadCount });
}
