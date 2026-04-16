// ========================================
// File: src/app/(admin)/admin/fixtures/social-actions.ts
// ========================================

"use server";

import { SocialPostStatus, SocialPostType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  buildFixtureSocialCaption,
  getFixtureSocialPostType,
} from "@/lib/social/fixture-social";

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

function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "http://localhost:3000"
  );
}

function getFixtureImageUrl(fixtureId: string) {
  return `${getBaseUrl()}/api/social/image/${fixtureId}`;
}

async function postDraftWebhook(input: {
  fixtureId: string;
  postType: SocialPostType;
  caption: string;
  needsApproval: boolean;
  imageUrl: string;
  league: {
    id: string;
    name: string;
    slug: string;
    season: string | null;
  };
  fixture: {
    id: string;
    kickoffAt: Date;
    venueName: string | null;
    status: "SCHEDULED" | "COMPLETED" | "POSTPONED" | "CANCELLED";
  };
  teams: {
    home: {
      name: string;
      badgeUrl: string | null;
      score: number | null;
    };
    away: {
      name: string;
      badgeUrl: string | null;
      score: number | null;
    };
  };
}) {
  const webhookUrl = process.env.SOCIAL_DRAFT_WEBHOOK_URL?.trim();

  if (!webhookUrl) {
    return {
      ok: false,
      reason: "SOCIAL_DRAFT_WEBHOOK_URL is not configured.",
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
      event: "fixture.social.draft.requested",
      fixtureId: input.fixtureId,
      postType: input.postType,
      needsApproval: input.needsApproval,
      callbackUrl: `${getBaseUrl()}/api/social/callback`,
      league: input.league,
      fixture: {
        id: input.fixture.id,
        kickoffAt: input.fixture.kickoffAt.toISOString(),
        venueName: input.fixture.venueName,
        status: input.fixture.status,
      },
      teams: input.teams,
      draft: {
        caption: input.caption,
        imageUrl: input.imageUrl,
      },
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
      reason: text || `Webhook failed with status ${response.status}.`,
    } as const;
  }

  return {
    ok: true,
  } as const;
}

async function postPublishWebhook(input: {
  fixtureId: string;
  postType: SocialPostType;
  caption: string;
  imageUrl: string;
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
      event: "social.publish.requested",
      fixtureId: input.fixtureId,
      socialPostType: input.postType,
      caption: input.caption,
      imageUrl: input.imageUrl,
      platforms: input.platforms,
      callbackUrl: `${getBaseUrl()}/api/social/callback`,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      ok: false,
      reason: text || `Publish webhook failed with status ${response.status}.`,
    } as const;
  }

  return {
    ok: true,
  } as const;
}

function revalidateFixturePaths(input: {
  leagueId: string;
  leagueSlug: string | null;
}) {
  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/social");
  revalidatePath(`/admin/leagues/${input.leagueId}/fixtures`);
  revalidatePath(`/admin/leagues/${input.leagueId}`);

  if (input.leagueSlug) {
    revalidatePath(`/leagues/${input.leagueSlug}`);
    revalidatePath(`/leagues/${input.leagueSlug}/fixtures`);
  }
}

export async function generateFixtureSocialDraftAction(formData: FormData) {
  await requireAdmin();

  const fixtureId = parseRequiredString(formData.get("fixtureId"), "Fixture ID");

  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: {
      id: true,
      leagueId: true,
      status: true,
      kickoffAt: true,
      socialNeedsApproval: true,
      league: {
        select: {
          id: true,
          name: true,
          slug: true,
          season: true,
        },
      },
      venue: {
        select: {
          name: true,
        },
      },
      homeTeam: {
        select: {
          name: true,
          logoUrl: true,
        },
      },
      awayTeam: {
        select: {
          name: true,
          logoUrl: true,
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

  if (!fixture) {
    throw new Error("Fixture not found.");
  }

  if (!fixture.league) {
    throw new Error("Fixture league not found.");
  }

  if (!fixture.homeTeam || !fixture.awayTeam) {
    throw new Error("Fixture teams are incomplete.");
  }

  if (fixture.result?.isDisputed) {
    throw new Error("Disputed results cannot be turned into social drafts.");
  }

  const postType = getFixtureSocialPostType({
    status: fixture.status,
    homeScore: fixture.result?.homeScore ?? null,
    awayScore: fixture.result?.awayScore ?? null,
  });

  if (postType === SocialPostType.NONE) {
    throw new Error("This fixture is not ready for a social draft.");
  }

  const caption = buildFixtureSocialCaption({
    postType,
    leagueName: fixture.league.name,
    venueName: fixture.venue?.name ?? null,
    homeTeamName: fixture.homeTeam.name,
    awayTeamName: fixture.awayTeam.name,
    kickoffAt: fixture.kickoffAt,
    homeScore: fixture.result?.homeScore ?? null,
    awayScore: fixture.result?.awayScore ?? null,
    status: fixture.status,
  });

  const imageUrl = getFixtureImageUrl(fixture.id);

  await prisma.fixture.update({
    where: { id: fixture.id },
    data: {
      socialPostType: postType,
      socialPostStatus: SocialPostStatus.QUEUED,
      socialCaption: caption,
      socialImageUrl: imageUrl,
      socialQueuedAt: new Date(),
      socialApprovedAt: null,
      socialPublishedAt: null,
      socialLastError: null,
    },
  });

  const webhookResult = await postDraftWebhook({
    fixtureId: fixture.id,
    postType,
    caption,
    needsApproval: fixture.socialNeedsApproval,
    imageUrl,
    league: {
      id: fixture.league.id,
      name: fixture.league.name,
      slug: fixture.league.slug,
      season: fixture.league.season,
    },
    fixture: {
      id: fixture.id,
      kickoffAt: fixture.kickoffAt,
      venueName: fixture.venue?.name ?? null,
      status: fixture.status,
    },
    teams: {
      home: {
        name: fixture.homeTeam.name,
        badgeUrl: fixture.homeTeam.logoUrl ?? null,
        score: fixture.result?.homeScore ?? null,
      },
      away: {
        name: fixture.awayTeam.name,
        badgeUrl: fixture.awayTeam.logoUrl ?? null,
        score: fixture.result?.awayScore ?? null,
      },
    },
  });

  if (!webhookResult.ok) {
    await prisma.fixture.update({
      where: { id: fixture.id },
      data: {
        socialPostStatus: SocialPostStatus.FAILED,
        socialLastError: webhookResult.reason,
      },
    });
  }

  revalidateFixturePaths({
    leagueId: fixture.leagueId,
    leagueSlug: fixture.league.slug,
  });
}

export async function approveFixtureSocialPostAction(formData: FormData) {
  await requireAdmin();

  const fixtureId = parseRequiredString(formData.get("fixtureId"), "Fixture ID");

  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: {
      id: true,
      leagueId: true,
      socialPostStatus: true,
      league: {
        select: {
          slug: true,
        },
      },
    },
  });

  if (!fixture) {
    throw new Error("Fixture not found.");
  }

  if (
    fixture.socialPostStatus !== SocialPostStatus.DRAFTED &&
    fixture.socialPostStatus !== SocialPostStatus.QUEUED
  ) {
    throw new Error("Only queued or drafted social posts can be approved.");
  }

  await prisma.fixture.update({
    where: { id: fixture.id },
    data: {
      socialPostStatus: SocialPostStatus.APPROVED,
      socialApprovedAt: new Date(),
      socialLastError: null,
    },
  });

  revalidateFixturePaths({
    leagueId: fixture.leagueId,
    leagueSlug: fixture.league.slug ?? null,
  });
}

export async function publishFixtureSocialPostAction(formData: FormData) {
  await requireAdmin();

  const fixtureId = parseRequiredString(formData.get("fixtureId"), "Fixture ID");

  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: {
      id: true,
      leagueId: true,
      socialPostStatus: true,
      socialPostType: true,
      socialCaption: true,
      socialImageUrl: true,
      league: {
        select: {
          slug: true,
        },
      },
    },
  });

  if (!fixture) {
    throw new Error("Fixture not found.");
  }

  if (fixture.socialPostStatus !== SocialPostStatus.APPROVED) {
    throw new Error("Only approved social posts can be published.");
  }

  if (!fixture.socialCaption) {
    throw new Error("No social caption found for this fixture.");
  }

  if (!fixture.socialImageUrl) {
    throw new Error("No social image found for this fixture.");
  }
  console.error("Publish to Meta debug", {
    fixtureId: fixture.id,
    webhookUrl: process.env.SOCIAL_PUBLISH_WEBHOOK_URL,
    status: fixture.socialPostStatus,
  });
  
  const publishResult = await postPublishWebhook({
    fixtureId: fixture.id,
    postType: fixture.socialPostType,
    caption: fixture.socialCaption,
    imageUrl: fixture.socialImageUrl,
    platforms: ["facebook", "instagram"],
  });

  if (!publishResult.ok) {
    await prisma.fixture.update({
      where: { id: fixture.id },
      data: {
        socialLastError: publishResult.reason,
      },
    });
  
    revalidateFixturePaths({
      leagueId: fixture.leagueId,
      leagueSlug: fixture.league.slug ?? null,
    });
  
    return;
  }

  revalidateFixturePaths({
    leagueId: fixture.leagueId,
    leagueSlug: fixture.league.slug ?? null,
  });
}

export async function resetFixtureSocialPostAction(formData: FormData) {
  await requireAdmin();

  const fixtureId = parseRequiredString(formData.get("fixtureId"), "Fixture ID");

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
    throw new Error("Fixture not found.");
  }

  await prisma.fixture.update({
    where: { id: fixture.id },
    data: {
      socialPostType: SocialPostType.NONE,
      socialPostStatus: SocialPostStatus.NONE,
      socialCaption: null,
      socialImageUrl: null,
      socialDraftExternalId: null,
      socialLastError: null,
      socialQueuedAt: null,
      socialApprovedAt: null,
      socialPublishedAt: null,
    },
  });

  revalidateFixturePaths({
    leagueId: fixture.leagueId,
    leagueSlug: fixture.league.slug ?? null,
  });
}