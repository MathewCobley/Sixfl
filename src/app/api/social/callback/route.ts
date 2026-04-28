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
  revalidatePath("/admin/social");
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
  cardId?: unknown;
  socialMatchCardId?: unknown;
  socialPostStatus?: unknown;
  socialPostType?: unknown;
  socialCaption?: unknown;
  socialImageUrl?: unknown;
  socialDraftExternalId?: unknown;
  externalPostId?: unknown;
  socialLastError?: unknown;
  socialPublishedAt?: unknown;
};

async function handleWeeklyCardCallback(body: SocialCallbackBody) {
  const cardId =
    typeof body.cardId === "string"
      ? body.cardId.trim()
      : typeof body.socialMatchCardId === "string"
        ? body.socialMatchCardId.trim()
        : "";

  if (!cardId) {
    return null;
  }

  const rows = await prisma.$queryRaw<
    Array<{ id: string; leagueId: string; leagueSlug: string | null }>
  >`
    SELECT
      c."id",
      c."leagueId",
      l."slug" AS "leagueSlug"
    FROM "SocialMatchCard" c
    INNER JOIN "League" l ON l."id" = c."leagueId"
    WHERE c."id" = ${cardId}
    LIMIT 1
  `;

  const card = rows[0];

  if (!card) {
    return NextResponse.json(
      { ok: false, error: "Weekly match card not found" },
      { status: 404 },
    );
  }

  const status = isValidSocialPostStatus(body.socialPostStatus)
    ? body.socialPostStatus
    : null;
  const postType = isValidSocialPostType(body.socialPostType)
    ? body.socialPostType
    : null;
  const caption =
    typeof body.socialCaption === "string"
      ? body.socialCaption.trim() || null
      : null;
  const imageUrl =
    typeof body.socialImageUrl === "string"
      ? body.socialImageUrl.trim() || null
      : null;
  const externalPostId =
    typeof body.externalPostId === "string"
      ? body.externalPostId.trim() || null
      : typeof body.socialDraftExternalId === "string"
        ? body.socialDraftExternalId.trim() || null
        : null;
  const lastError =
    typeof body.socialLastError === "string"
      ? body.socialLastError.trim() || null
      : null;

  const publishedAt = (() => {
    if (typeof body.socialPublishedAt !== "string" || !body.socialPublishedAt.trim()) {
      return null;
    }

    const parsed = new Date(body.socialPublishedAt);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  })();

  await prisma.$executeRaw`
    UPDATE "SocialMatchCard"
    SET
      "postStatus" = COALESCE(${status}::"SocialPostStatus", "postStatus"),
      "postType" = COALESCE(${postType}::"SocialPostType", "postType"),
      "caption" = COALESCE(${caption}, "caption"),
      "imageUrl" = COALESCE(${imageUrl}, "imageUrl"),
      "externalPostId" = COALESCE(${externalPostId}, "externalPostId"),
      "lastError" = CASE
        WHEN ${status}::"SocialPostStatus" = ${SocialPostStatus.FAILED}::"SocialPostStatus" THEN COALESCE(${lastError}, 'Social publish callback reported a failure.')
        WHEN ${lastError} IS NOT NULL THEN ${lastError}
        WHEN ${status}::"SocialPostStatus" IN (${SocialPostStatus.DRAFTED}::"SocialPostStatus", ${SocialPostStatus.PUBLISHED}::"SocialPostStatus") THEN NULL
        ELSE "lastError"
      END,
      "publishedAt" = CASE
        WHEN ${status}::"SocialPostStatus" = ${SocialPostStatus.PUBLISHED}::"SocialPostStatus" THEN COALESCE(${publishedAt}, NOW())
        ELSE COALESCE(${publishedAt}, "publishedAt")
      END,
      "updatedAt" = NOW()
    WHERE "id" = ${cardId}
  `;

  revalidateFixturePaths({
    leagueId: card.leagueId,
    leagueSlug: card.leagueSlug,
  });

  return NextResponse.json({ ok: true, cardId });
}

async function handleFixtureCallback(body: SocialCallbackBody) {
  const fixtureId =
    typeof body.fixtureId === "string" ? body.fixtureId.trim() : "";

  if (!fixtureId) {
    return NextResponse.json(
      { ok: false, error: "fixtureId or cardId is required" },
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

  const weeklyResponse = await handleWeeklyCardCallback(body);

  if (weeklyResponse) {
    return weeklyResponse;
  }

  return handleFixtureCallback(body);
}
