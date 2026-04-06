// ========================================
// File: src/lib/requireCaptain.ts
// ========================================

import { TeamRole, UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";

type RequireCaptainResult = {
    membership: {
      id: string;
      teamId: string;
      role: TeamRole;
    };
    team: {
      id: string;
      name: string;
      slug: string;
    };
    user: {
      id: string;
      name: string | null;
      email: string | null;
    };
  };

const SUPER_ADMINS = [
  "hello@sixfl.co.uk",
  "mathew@sixfl.co.uk",
  "mathewcobley1@gmail.com",
];

export async function requireCaptain(teamId: string): Promise<RequireCaptainResult> {
  const session = await getServerSession(authOptions).catch(() => null);

  if (!session?.user?.email) {
    if (process.env.NODE_ENV !== "production") {
      return {
        session,
        user: null,
        membership: null,
        isAdmin: true,
      };
    }

    redirect("/login");
  }

  const email = session.user.email.toLowerCase().trim();

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
  });

  const isSuperAdmin = SUPER_ADMINS.includes(email);
  const isAdmin = isSuperAdmin || user?.role === UserRole.ADMIN;

  if (isAdmin) {
    return {
      session,
      user,
      membership: null,
      isAdmin: true,
    };
  }

  const membership = user
    ? await prisma.teamMember.findFirst({
        where: {
            teamId,
            userId: user.id,
            role: TeamRole.CAPTAIN,
          },
          select: {
            id: true,
            teamId: true,
            role: true,
          },
      })
    : null;

  if (!membership) {
    if (process.env.NODE_ENV !== "production") {
      return {
        session,
        user,
        membership: null,
        isAdmin: true,
      };
    }

    redirect("/dashboard");
  }

  return {
    session,
    user,
    membership,
    isAdmin: false,
  };
}
