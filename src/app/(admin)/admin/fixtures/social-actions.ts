// ========================================
// File: src/app/(admin)/admin/fixtures/social-actions.ts
// ========================================

"use server";

import {
  FixtureStatus,
  SocialPostStatus,
  SocialPostType,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

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

function getSocialPostTypeForFixture(input: {
  status: FixtureStatus;
  homeScore: number | null;
  awayScore: number | null;
}) {
  if (input.status === "COMPLETED") {
    if (input.homeScore === null || input.awayScore === null) {
      throw new Error("Completed fixtures need a saved result before creating a social draft.");
    }

    return SocialPostType.RESULT;
  }

  if (input.status === "SCHEDULED") {
    return SocialPostType.FIXTURE;
  }

  if (input.status === "POSTPONED" || input.status === "CANCELLED") {
    return SocialPostType.UPDATE;
  }

  return SocialPostType.NONE;
}

function buildFixtureSocialCaption(input: {
  postType: SocialPostType;
  leagueName: string;
  venueName: string | null;
  homeTeamName: string;
  awayTeamName: string;
  kickoffAt: Date;
  homeScore: number | null;
  awayScore: number | null;
  status: FixtureStatus;
}) {
  const kickoffLabel = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(input.kickoffAt);

  if (input.postType === "RESULT") {
    const venuePrefix = input.venueName ? ` at ${input.venueName}` : "";
    return `Full-time${venuePrefix}. ${input.homeTeamName} ${input.homeScore}-${input.awayScore} ${input.awayTeamName}. ${input.leagueName}. #SIXFL`;
  }

  if (input.postType === "FIXTURE") {
    const venueLabel = input.venueName ? ` at ${input.venueName}` : "";
    return `${input.homeTeamName} vs ${input.awayTeamName}. ${kickoffLabel}${venueLabel}. ${input.leagueName}. #SIXFL`;
  }

  if (input.postType === "UPDATE") {
    const venueLabel = input.venueName ? ` at ${input.venueName}` : "";
    const updateWord = input.status === "POSTPONED" ? "postponed" : "cancelled";
    return `${input.homeTeamName} vs ${input.awayTeamName}${venueLabel} has been ${updateWord}. ${input.leagueName}. #SIXFL`;
  }

  return `${input.homeTeamName} vs ${input.awayTeamName}. ${input.leagueName}. #SIXFL`;
}

function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "http://localhost:3000"
  );
}

async function postDraftWebhook(input: {
  fixtureId: string;
  postType: SocialPostType;
  caption: string;
  needsApproval: boolean;
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
    status: FixtureStatus;
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

  const postType = getSocialPostTypeForFixture({
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

  await prisma.fixture.update({
    where: { id: fixture.id },
    data: {
      socialPostType: postType,
      socialPostStatus: SocialPostStatus.QUEUED,
      socialCaption: caption,
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