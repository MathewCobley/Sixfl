// ========================================
// File: src/app/api/social/callback/route.ts
// ========================================

import { NextRequest, NextResponse } from "next/server";
import { SocialPostStatus, SocialPostType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isValidSocialWebhookRequest } from "@/lib/social/webhook-auth";

function isValidSocialPostStatus(value: unknown): value is SocialPostStatus {
  return (
    typeof value === "string" &&
    Object.values(SocialPostStatus).includes(value as SocialPostStatus)
  );
}

function isValidSocialPostType(value: unknown): value is SocialPostType {
  return (
    typeof value === "string" &&
    Object.values(SocialPostType).includes(value as SocialPostType)
  );
}

function revalidateFixturePaths(input: {
  leagueId: string;
  leagueSlug: string | null;
}) {
  revalidatePath("/admin/fixtures");
  revalidatePath(`/admin/leagues/${input.leagueId}/fixtures`);
  revalidatePath(`/admin/leagues/${input.leagueId}`);

  if (input.leagueSlug) {
    revalidatePath(`/leagues/${input.leagueSlug}`);
    revalidatePath(`/leagues/${input.leagueSlug}/fixtures`);
  }
}

type SocialCallbackBody = {
  fixtureId?: unknown;
  socialPostStatus?: unknown;
  socialPostType?: unknown;
  socialCaption?: unknown;
  socialImageUrl?: unknown;
  socialDraftExternalId?: unknown;
  socialLastError?: unknown;
  socialPublishedAt?: unknown;
};

export async function POST(request: NextRequest) {
  if (!isValidSocialWebhookRequest(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorised" },
      { status: 401 },
    );
  }

  let body: SocialCallbackBody;

  try {
    body = (await request.json()) as SocialCallbackBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const fixtureId =
    typeof body.fixtureId === "string" ? body.fixtureId.trim() : "";

  if (!fixtureId) {
    return NextResponse.json(
      { ok: false, error: "fixtureId is required" },
      { status: 400 },
    );
  }

  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: {
      id: true,
      leagueId: true,
      league: {
        select: {
          slug: true,
        },
      },
    },
  });

  if (!fixture) {
    return NextResponse.json(
      { ok: false, error: "Fixture not found" },
      { status: 404 },
    );
  }

  const updates: {
    socialPostStatus?: SocialPostStatus;
    socialPostType?: SocialPostType;
    socialCaption?: string | null;
    socialImageUrl?: string | null;
    socialDraftExternalId?: string | null;
    socialLastError?: string | null;
    socialPublishedAt?: Date | null;
    socialApprovedAt?: Date | null;
  } = {};

  if (isValidSocialPostStatus(body.socialPostStatus)) {
    updates.socialPostStatus = body.socialPostStatus;
  }

  if (isValidSocialPostType(body.socialPostType)) {
    updates.socialPostType = body.socialPostType;
  }

  if (typeof body.socialCaption === "string") {
    updates.socialCaption = body.socialCaption.trim() || null;
  }

  if (typeof body.socialImageUrl === "string") {
    updates.socialImageUrl = body.socialImageUrl.trim() || null;
  }

  if (typeof body.socialDraftExternalId === "string") {
    updates.socialDraftExternalId = body.socialDraftExternalId.trim() || null;
  }

  if (typeof body.socialLastError === "string") {
    updates.socialLastError = body.socialLastError.trim() || null;
  }

  if (typeof body.socialPublishedAt === "string" && body.socialPublishedAt.trim()) {
    const parsed = new Date(body.socialPublishedAt);

    if (!Number.isNaN(parsed.getTime())) {
      updates.socialPublishedAt = parsed;
    }
  }

  if (
    updates.socialPostStatus === SocialPostStatus.PUBLISHED &&
    !updates.socialPublishedAt
  ) {
    updates.socialPublishedAt = new Date();
  }

  if (updates.socialPostStatus === SocialPostStatus.DRAFTED) {
    updates.socialLastError = null;
  }

  if (
    updates.socialPostStatus === SocialPostStatus.FAILED &&
    updates.socialLastError === undefined
  ) {
    updates.socialLastError =
      "Social draft or publish callback reported a failure.";
  }

  await prisma.fixture.update({
    where: { id: fixtureId },
    data: updates,
  });

  revalidateFixturePaths({
    leagueId: fixture.leagueId,
    leagueSlug: fixture.league.slug ?? null,
  });

  return NextResponse.json({
    ok: true,
    fixtureId,
    applied: updates,
  });
}