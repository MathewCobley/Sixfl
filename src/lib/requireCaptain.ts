// ========================================
// File: src/lib/requireCaptain.ts
// ========================================

import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TeamRole, UserRole } from "@prisma/client";

import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";

export const CAPTAIN_ONLY_PREVIEW_COOKIE = "sixfl-captain-only-preview-team";

type RequireCaptainResult = {
  session: Awaited<ReturnType<typeof getServerSession>> | null;
  user:
    | {
        id: string;
        email: string | null;
        name: string | null;
        role: UserRole;
      }
    | null;
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
  isAdmin: boolean;
  isCaptain: boolean;
  accessMode: "admin-preview" | "captain-preview" | "captain";
};

async function isCaptainOnlyPreviewEnabled(input: {
  teamId: string;
  isAdmin: boolean;
}) {
  if (!input.isAdmin) return false;

  const cookieStore = await cookies();
  const previewTeamId = cookieStore.get(CAPTAIN_ONLY_PREVIEW_COOKIE)?.value;

  return previewTeamId === input.teamId;
}

export async function requireCaptain(
  teamId: string,
): Promise<RequireCaptainResult> {
  const session = await getServerSession(authOptions).catch(() => null);

  if (!session?.user?.email) {
    if (process.env.NODE_ENV !== "production") {
      return {
        session: null,
        user: null,
        membership: null,
        isAdmin: false,
        isCaptain: false,
        accessMode: "captain",
      };
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

  const rawIsAdmin = user?.role === UserRole.ADMIN;
  const isCaptainOnlyPreview = await isCaptainOnlyPreviewEnabled({
    teamId,
    isAdmin: rawIsAdmin,
  });
  const isAdmin = rawIsAdmin && !isCaptainOnlyPreview;
  const isCaptain = Boolean(membership) || isCaptainOnlyPreview;

  if (!rawIsAdmin && !membership) {
    if (process.env.NODE_ENV !== "production") {
      return {
        session,
        user,
        membership: null,
        isAdmin: false,
        isCaptain: false,
        accessMode: "captain",
      };
    }

    redirect("/dashboard");
  }

  return {
    session,
    user,
    membership,
    isAdmin,
    isCaptain,
    accessMode: isCaptainOnlyPreview ? "captain-preview" : "captain",
  };
}
