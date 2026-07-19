import { NotificationRecipientSourceType, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const DEFAULT_TEAM_KIT_COLOUR = "#64748B";

export function normaliseTeamKitColour(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed.toUpperCase() : null;
}

function metadataRecord(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function getTeamKitColour(teamId: string): Promise<string | null> {
  const recipient = await prisma.notificationRecipient.findFirst({
    where: {
      sourceType: NotificationRecipientSourceType.TEAM,
      sourceId: teamId,
    },
    select: { metadata: true },
  });

  return normaliseTeamKitColour(metadataRecord(recipient?.metadata ?? null)?.kitPrimaryColour);
}

export async function getTeamKitColours(teamIds: string[]) {
  const uniqueIds = Array.from(new Set(teamIds.filter(Boolean)));
  if (uniqueIds.length === 0) return new Map<string, string | null>();

  const recipients = await prisma.notificationRecipient.findMany({
    where: {
      sourceType: NotificationRecipientSourceType.TEAM,
      sourceId: { in: uniqueIds },
    },
    select: {
      sourceId: true,
      metadata: true,
    },
  });

  const colours = new Map<string, string | null>(
    uniqueIds.map((teamId) => [teamId, null]),
  );

  for (const recipient of recipients) {
    if (!recipient.sourceId) continue;
    colours.set(
      recipient.sourceId,
      normaliseTeamKitColour(metadataRecord(recipient.metadata)?.kitPrimaryColour),
    );
  }

  return colours;
}
