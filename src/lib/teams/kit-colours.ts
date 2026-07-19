import { prisma } from "@/lib/prisma";
import { normaliseTeamKitColour } from "@/lib/teams/kit-colour-values";

function metadataRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function getTeamKitColour(teamId: string): Promise<string | null> {
  const recipient = await prisma.notificationRecipient.findFirst({
    where: {
      sourceType: "TEAM",
      sourceId: teamId,
    },
    select: { metadata: true },
  });

  return normaliseTeamKitColour(
    metadataRecord(recipient?.metadata)?.kitPrimaryColour,
  );
}

export async function getTeamKitColours(
  teamIds: string[],
): Promise<Map<string, string | null>> {
  const uniqueIds = Array.from(new Set(teamIds.filter(Boolean)));
  if (uniqueIds.length === 0) return new Map<string, string | null>();

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

  const colours = new Map<string, string | null>();
  for (const teamId of uniqueIds) colours.set(teamId, null);

  for (const recipient of recipients) {
    if (!recipient.sourceId) continue;
    colours.set(
      recipient.sourceId,
      normaliseTeamKitColour(
        metadataRecord(recipient.metadata)?.kitPrimaryColour,
      ),
    );
  }

  return colours;
}
