// ========================================
// File: src/app/(admin)/admin/social/weekly-actions.ts
// ========================================

"use server";

import { randomUUID } from "node:crypto";
import { SocialPostStatus, SocialPostType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { parseLondonDateTime } from "@/lib/datetime/london";
import {
  buildWeeklyMatchCardCaption,
  getBaseUrl,
  getWeeklyMatchCardImageUrl,
  type WeeklyMatchCardFixture,
  type WeeklySocialPostType,
} from "@/lib/social/weekly-match-card";

function parseRequiredString(
  value: FormDataEntryValue | null,
  fieldName: string,
) {
  const str = String(value ?? "").trim();

  if (!str) {
    throw new Error(`${fieldName} is required.`);
  }

  return str;
}

function parseWeeklyPostType(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();

  if (raw === "RESULT" || raw === "UPDATE" || raw === "FIXTURE") {
    return raw as WeeklySocialPostType;
  }

  return "FIXTURE" as const;
}

function getFixtureDateBounds(dateInput: string) {
  const start = parseLondonDateTime(dateInput, "00:00");
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return { start, end };
}

function revalidateWeeklySocialPaths(input?: { leagueSlug?: string | null }) {
  revalidatePath("/admin/social");
  revalidatePath("/admin/fixtures");

  if (input?.leagueSlug) {
    revalidatePath(`/leagues/${input.leagueSlug}`);
    revalidatePath(`/leagues/${input.leagueSlug}/fixtures`);
  }
}

async function getFixturesForWeeklyCard(input: {
  leagueId: string;
  start: Date;
  end: Date;
  postType: WeeklySocialPostType;
}) {
  const fixtures = await prisma.fixture.findMany({
    where: {
      leagueId: input.leagueId,
      kickoffAt: {
        gte: input.start,
        lt: input.end,
      },
      status:
        input.postType === "RESULT"
          ? "COMPLETED"
          : input.postType === "UPDATE"
            ? { in: ["POSTPONED", "CANCELLED"] }
            : { in: ["SCHEDULED", "POSTPONED", "CANCELLED"] },
    },
    orderBy: [{ kickoffAt: "asc" }, { pitch: "asc" }, { position: "asc" }],
    select: {
      id: true,
      kickoffAt: true,
      pitch: true,
      status: true,
      homeTeam: {
        select: {
          name: true,
        },
      },
      awayTeam: {
        select: {
          name: true,
        },
      },
      result: {
        select: {
          homeScore: true,
          awayScore: true,
          isDisputed: true,
        },
      },
    },
  });

  if (input.postType === "RESULT") {
    const disputed = fixtures.find((fixture) => fixture.result?.isDisputed);

    if (disputed) {
      throw new Error("Disputed results cannot be added to a weekly results card.");
    }
  }

  return fixtures.map<WeeklyMatchCardFixture>((fixture) => ({
    id: fixture.id,
    kickoffAt: fixture.kickoffAt,
    pitch: fixture.pitch,
    status: fixture.status,
    homeTeamName: fixture.homeTeam.name,
    awayTeamName: fixture.awayTeam.name,
    homeScore: fixture.result?.homeScore ?? null,
    awayScore: fixture.result?.awayScore ?? null,
  }));
}

async function postWeeklyPublishWebhook(input: {
  cardId: string;
  postType: WeeklySocialPostType;
  caption: string;
  imageUrl: string;
  fixtureDate: Date;
  platforms: Array<"facebook" | "instagram">;
}) {
  const webhookUrl = process.env.SOCIAL_PUBLISH_WEBHOOK_URL?.trim();

  if (!webhookUrl) {
    return {
      ok: false,
      reason: "SOCIAL_PUBLISH_WEBHOOK_URL is not configured.",
    } as const;
  }

  const secret = process.env.SOCIAL_WEBHOOK_SECRET?.trim() || "";

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "x-sixfl-social-secret": secret } : {}),
    },
    body: JSON.stringify({
      event: "weekly.social.publish.requested",
      cardId: input.cardId,
      socialMatchCardId: input.cardId,
      socialPostType: input.postType,
      caption: input.caption,
      imageUrl: input.imageUrl,
      fixtureDate: input.fixtureDate.toISOString(),
      platforms: input.platforms,
      callbackUrl: `${getBaseUrl()}/api/social/callback`,
      branding: {
        name: "SIXFL",
        tagline: "6-a-side football. Done properly.",
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      ok: false,
      reason: text || `Publish webhook failed with status ${response.status}.`,
    } as const;
  }

  return { ok: true } as const;
}

type CardLookupRow = {
  id: string;
  leagueId: string;
  leagueSlug: string | null;
  fixtureDate: Date;
  postType: SocialPostType;
  postStatus: SocialPostStatus;
  caption: string | null;
  imageUrl: string | null;
};

async function getCard(cardId: string) {
  const rows = await prisma.$queryRaw<CardLookupRow[]>`
    SELECT
      c."id",
      c."leagueId",
      l."slug" AS "leagueSlug",
      c."fixtureDate",
      c."postType",
      c."postStatus",
      c."caption",
      c."imageUrl"
    FROM "SocialMatchCard" c
    INNER JOIN "League" l ON l."id" = c."leagueId"
    WHERE c."id" = ${cardId}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function generateWeeklyMatchCardAction(formData: FormData) {
  await requireAdmin();

  const leagueId = parseRequiredString(formData.get("leagueId"), "League ID");
  const dateInput = parseRequiredString(formData.get("fixtureDate"), "Fixture date");
  const postType = parseWeeklyPostType(formData.get("postType"));
  const { start, end } = getFixtureDateBounds(dateInput);

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      id: true,
      name: true,
      slug: true,
    },
  });

  if (!league) {
    throw new Error("League not found.");
  }

  const fixtures = await getFixturesForWeeklyCard({
    leagueId,
    start,
    end,
    postType,
  });

  if (fixtures.length === 0) {
    throw new Error("No fixtures were found for that league and date.");
  }

  const caption = buildWeeklyMatchCardCaption({
    postType,
    leagueName: league.name,
    fixtureDate: start,
    fixtures,
  });

  const cardId = randomUUID();
  const imageUrl = getWeeklyMatchCardImageUrl(cardId);

  await prisma.$transaction(async (tx) => {
    const upserted = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "SocialMatchCard" (
        "id",
        "leagueId",
        "fixtureDate",
        "round",
        "postType",
        "postStatus",
        "caption",
        "imageUrl",
        "lastError",
        "needsApproval",
        "queuedAt",
        "approvedAt",
        "publishedAt",
        "updatedAt"
      ) VALUES (
        ${cardId},
        ${leagueId},
        ${start},
        ${null},
        ${postType}::"SocialPostType",
        ${SocialPostStatus.DRAFTED}::"SocialPostStatus",
        ${caption},
        ${imageUrl},
        ${null},
        ${true},
        ${new Date()},
        ${null},
        ${null},
        ${new Date()}
      )
      ON CONFLICT ("leagueId", "fixtureDate", "postType")
      DO UPDATE SET
        "caption" = EXCLUDED."caption",
        "imageUrl" = CONCAT(${getBaseUrl()}, '/api/social/match-card/', "SocialMatchCard"."id"),
        "postStatus" = ${SocialPostStatus.DRAFTED}::"SocialPostStatus",
        "lastError" = NULL,
        "queuedAt" = NOW(),
        "approvedAt" = NULL,
        "publishedAt" = NULL,
        "updatedAt" = NOW()
      RETURNING "id"
    `;

    const resolvedCardId = upserted[0]?.id ?? cardId;

    await tx.$executeRaw`
      DELETE FROM "SocialMatchCardFixture"
      WHERE "socialMatchCardId" = ${resolvedCardId}
    `;

    for (const [index, fixture] of fixtures.entries()) {
      await tx.$executeRaw`
        INSERT INTO "SocialMatchCardFixture" (
          "id",
          "socialMatchCardId",
          "fixtureId",
          "position"
        ) VALUES (
          ${randomUUID()},
          ${resolvedCardId},
          ${fixture.id},
          ${index}
        )
      `;
    }
  });

  revalidateWeeklySocialPaths({ leagueSlug: league.slug });
  redirect("/admin/social?generated=card-regenerated");
}

export async function approveWeeklyMatchCardAction(formData: FormData) {
  await requireAdmin();

  const cardId = parseRequiredString(formData.get("cardId"), "Card ID");
  const card = await getCard(cardId);

  if (!card) {
    throw new Error("Weekly match card not found.");
  }

  await prisma.$executeRaw`
    UPDATE "SocialMatchCard"
    SET
      "postStatus" = ${SocialPostStatus.APPROVED}::"SocialPostStatus",
      "approvedAt" = NOW(),
      "lastError" = NULL,
      "updatedAt" = NOW()
    WHERE "id" = ${cardId}
  `;

  revalidateWeeklySocialPaths({ leagueSlug: card.leagueSlug });
}

export async function publishWeeklyMatchCardAction(formData: FormData) {
  await requireAdmin();

  const cardId = parseRequiredString(formData.get("cardId"), "Card ID");
  const card = await getCard(cardId);

  if (!card) {
    throw new Error("Weekly match card not found.");
  }

  if (card.postStatus !== SocialPostStatus.APPROVED) {
    await prisma.$executeRaw`
      UPDATE "SocialMatchCard"
      SET
        "lastError" = ${`Publish blocked because status was ${card.postStatus}. Approve the card first.`},
        "updatedAt" = NOW()
      WHERE "id" = ${cardId}
    `;

    revalidateWeeklySocialPaths({ leagueSlug: card.leagueSlug });
    return;
  }

  if (!card.caption || !card.imageUrl) {
    await prisma.$executeRaw`
      UPDATE "SocialMatchCard"
      SET
        "postStatus" = ${SocialPostStatus.FAILED}::"SocialPostStatus",
        "lastError" = 'No caption or image URL found for this weekly card.',
        "updatedAt" = NOW()
      WHERE "id" = ${cardId}
    `;

    revalidateWeeklySocialPaths({ leagueSlug: card.leagueSlug });
    return;
  }

  const result = await postWeeklyPublishWebhook({
    cardId,
    postType: card.postType as WeeklySocialPostType,
    caption: card.caption,
    imageUrl: card.imageUrl,
    fixtureDate: card.fixtureDate,
    platforms: ["facebook", "instagram"],
  });

  if (!result.ok) {
    await prisma.$executeRaw`
      UPDATE "SocialMatchCard"
      SET
        "postStatus" = ${SocialPostStatus.FAILED}::"SocialPostStatus",
        "lastError" = ${result.reason},
        "updatedAt" = NOW()
      WHERE "id" = ${cardId}
    `;

    revalidateWeeklySocialPaths({ leagueSlug: card.leagueSlug });
    return;
  }

  await prisma.$executeRaw`
    UPDATE "SocialMatchCard"
    SET
      "postStatus" = ${SocialPostStatus.QUEUED}::"SocialPostStatus",
      "lastError" = NULL,
      "updatedAt" = NOW()
    WHERE "id" = ${cardId}
  `;

  revalidateWeeklySocialPaths({ leagueSlug: card.leagueSlug });
}

export async function markWeeklyMatchCardPublishedAction(formData: FormData) {
  await requireAdmin();

  const cardId = parseRequiredString(formData.get("cardId"), "Card ID");
  const card = await getCard(cardId);

  if (!card) {
    throw new Error("Weekly match card not found.");
  }

  await prisma.$executeRaw`
    UPDATE "SocialMatchCard"
    SET
      "postStatus" = ${SocialPostStatus.PUBLISHED}::"SocialPostStatus",
      "publishedAt" = NOW(),
      "lastError" = NULL,
      "updatedAt" = NOW()
    WHERE "id" = ${cardId}
  `;

  revalidateWeeklySocialPaths({ leagueSlug: card.leagueSlug });
}

export async function deleteWeeklyMatchCardAction(formData: FormData) {
  await requireAdmin();

  const cardId = parseRequiredString(formData.get("cardId"), "Card ID");
  const card = await getCard(cardId);

  if (!card) {
    throw new Error("Weekly match card not found.");
  }

  await prisma.$executeRaw`
    DELETE FROM "SocialMatchCard"
    WHERE "id" = ${cardId}
  `;

  revalidateWeeklySocialPaths({ leagueSlug: card.leagueSlug });
}
