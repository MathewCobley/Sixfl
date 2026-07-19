import { prisma } from "@/lib/prisma";

function normaliseColour(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed.toUpperCase() : null;
}

function metadataRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function getTeamKitColours(
  teamIds: string[],
): Promise<Map<string, string | null>> {
  const uniqueIds = Array.from(new Set(teamIds.filter(Boolean)));
  const colours = new Map<string, string | null>();

  for (const teamId of uniqueIds) colours.set(teamId, null);
  if (uniqueIds.length === 0) return colours;

  const recipients = await prisma.notificationRecipient.findMany({
    where: {
      sourceType: "TEAM",
      sourceId: { in: uniqueIds },
    },
    select: {
      sourceId: true,
      metadata: true,
    },
  });

  for (const recipient of recipients) {
    if (!recipient.sourceId) continue;
    colours.set(
      recipient.sourceId,
      normaliseColour(metadataRecord(recipient.metadata)?.kitPrimaryColour),
    );
  }

  return colours;
}
