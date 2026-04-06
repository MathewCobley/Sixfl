// ========================================
// File: src/lib/requireCaptain.ts
// ========================================

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { TeamRole } from "@prisma/client";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";

type RequireCaptainResult = {
  session: Awaited<ReturnType<typeof getServerSession>> | null;
  user: {
    id: string;
    email: string | null;
    name: string | null;
    role: unknown;
  } | null;
  membership:
    | {
        id: string;
        teamId: string;
        role: TeamRole;
        team: {
          id: string;
          name: string;
          leagueId: string | null;
        };
      }
    | null;
};

export async function requireCaptain(teamId: string): Promise<RequireCaptainResult> {
  const session = await getServerSession(authOptions).catch(() => null);

  if (!session?.user?.email) {
    if (process.env.NODE_ENV !== "production") {
      return { session: null, user: null, membership: null };
    }

    redirect("/login");
  }

  const email = session.user.email.toLowerCase().trim();

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, role: true },
  });

  const membership = user
    ? await prisma.teamMember.findFirst({
        where: {
          teamId,
          userId: user.id,
          role: TeamRole.CAPTAIN,
        },
        include: {
          team: {
            select: {
              id: true,
              name: true,
              leagueId: true,
            },
          },
        },
      })
    : null;

  if (!membership) {
    if (process.env.NODE_ENV !== "production") {
      return { session, user, membership: null };
    }

    redirect("/dashboard");
  }

  return { session, user, membership };
}