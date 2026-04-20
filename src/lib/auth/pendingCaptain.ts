// ========================================
// File: src/lib/auth/pendingCaptain.ts
// ========================================

import { prisma } from "@/lib/prisma";

export type PendingCaptainContext = {
  teamId: string;
  teamName: string;
  claimCode: string;
};

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
        not: null,
      },
      OR: [
        {
          captainInviteSentTo: {
            equals: email,
            mode: "insensitive",
          },
        },
        {
          contactEmail: {
            equals: email,
            mode: "insensitive",
          },
        },
        {
          secondaryContactEmail: {
            equals: email,
            mode: "insensitive",
          },
        },
      ],
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
