import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { UserRole } from "@prisma/client";

import { authOptions } from "@/auth";
import PortalChat from "@/components/messaging/PortalChat";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Team Chat | SIXFL",
};

export default async function PlayerTeamChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamid: string }>;
  searchParams?: Promise<{ previewMembershipId?: string }>;
}) {
  const { teamid } = await params;
  const sp = (await searchParams) ?? {};
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/player/team/${teamid}/chat`)}`,
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email.trim().toLowerCase() },
    select: {
      id: true,
      role: true,
      teamMembers: {
        where: { teamId: teamid },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!user) notFound();

  const previewMembershipId =
    user.role === UserRole.ADMIN
      ? sp.previewMembershipId?.trim() || null
      : null;

  if (user.role !== UserRole.ADMIN && user.teamMembers.length === 0) {
    notFound();
  }

  return (
    <PortalChat
      teamId={teamid}
      sixflHref={`/player/team/${teamid}#message-sixfl`}
      previewMembershipId={previewMembershipId}
    />
  );
}
