// ========================================
// File: src/lib/auth/pendingCaptain.ts
// ========================================

import { prisma } from "@/lib/prisma";

export type PendingCaptainContext = {
  teamId: string;
  teamName: string;
  claimCode: string;
};

export type CaptainLoginContext = {
  teamId: string;
  teamName: string;
  captainUserId: string | null;
  claimCode: string | null;
};

function buildCaptainEmailWhere(email: string) {
  return {
    OR: [
      {
        captainInviteSentTo: {
          equals: email,
          mode: "insensitive" as const,
        },
      },
      {
        contactEmail: {
          equals: email,
          mode: "insensitive" as const,
        },
      },
      {
        secondaryContactEmail: {
          equals: email,
          mode: "insensitive" as const,
        },
      },
    ],
  };
}

export async function getPendingCaptainContext(
  emailInput: string,
): Promise<PendingCaptainContext | null> {
  const email = emailInput.trim().toLowerCase();

  if (!email) {
    return null;
  }

  const team = await prisma.team.findFirst({
    where: {
      captainUserId: null,
      claimCode: {
        not: "",
      },
      ...buildCaptainEmailWhere(email),
    },
    select: {
      id: true,
      name: true,
      claimCode: true,
    },
    orderBy: [
      {
        captainInviteSentAt: "desc",
      },
      {
        updatedAt: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
  });

  if (!team?.claimCode) {
    return null;
  }

  return {
    teamId: team.id,
    teamName: team.name,
    claimCode: team.claimCode,
  };
}

export async function getCaptainLoginContext(
  emailInput: string,
): Promise<CaptainLoginContext | null> {
  const email = emailInput.trim().toLowerCase();

  if (!email) {
    return null;
  }

  const team = await prisma.team.findFirst({
    where: buildCaptainEmailWhere(email),
    select: {
      id: true,
      name: true,
      captainUserId: true,
      claimCode: true,
    },
    orderBy: [
      {
        captainInviteSentAt: "desc",
      },
      {
        updatedAt: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
  });

  if (!team) {
    return null;
  }

  return {
    teamId: team.id,
    teamName: team.name,
    captainUserId: team.captainUserId,
    claimCode: team.claimCode,
  };
}
