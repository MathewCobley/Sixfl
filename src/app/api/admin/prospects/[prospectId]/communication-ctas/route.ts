// ========================================
// File: src/app/api/admin/prospects/[prospectId]/communication-ctas/route.ts
// ========================================

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function getMetadataRecord(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  return metadata as Record<string, unknown>;
}

function getString(metadata: unknown, key: string) {
  const record = getMetadataRecord(metadata);
  const value = record?.[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getCta(metadata: unknown) {
  const ctaLabel = getString(metadata, "ctaLabel");
  const ctaUrl = getString(metadata, "ctaUrl");

  if (ctaLabel && ctaUrl) {
    return { label: ctaLabel, url: ctaUrl };
  }

  const paymentUrl = getString(metadata, "paymentUrl");
  if (paymentUrl) return { label: "Pay now", url: paymentUrl };

  const teamJoinUrl = getString(metadata, "teamJoinUrl");
  if (teamJoinUrl) return { label: "Complete registration", url: teamJoinUrl };

  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ prospectId: string }> },
) {
  await requireAdmin();

  const { prospectId } = await params;

  const dispatches = await prisma.notificationDispatch.findMany({
    where: {
      sourceType: "TEAM_PLAYER_PROSPECT",
      sourceId: prospectId,
      channel: "EMAIL",
    },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      subject: true,
      metadata: true,
      createdAt: true,
      sentAt: true,
    },
  });

  const items = dispatches
    .map((dispatch) => {
      const cta = getCta(dispatch.metadata);
      if (!cta) return null;

      return {
        id: dispatch.id,
        subject: dispatch.subject?.trim() || "Email",
        label: cta.label,
        url: cta.url,
        occurredAt: (dispatch.sentAt ?? dispatch.createdAt).toISOString(),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return NextResponse.json({ items });
}
