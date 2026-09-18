import { createHash, randomUUID } from "node:crypto";

import {
  getLondonMinutesSinceMidnight,
  parseLondonDateTime,
  toLondonDateInputValue,
} from "@/lib/datetime/london";
import { publishNewsAutomatically } from "@/lib/league-news/manage";
import { prisma } from "@/lib/prisma";
import { getReportSource, sourceHash } from "./facts";
import { reportConfigured, reportModel, writeOpenAiReport } from "./openai";
import {
  claimGeneration,
  failGeneration,
  finishGeneration,
  readStoredReport,
} from "./store";

const AUTO_REPORT_ACTOR = createHash("sha256")
  .update("sixfl:auto-matchnight-report")
  .digest("hex");
const SIX_PM_MINUTES = 18 * 60;
const MAX_LEAGUES_PER_RUN = 8;
const CONCURRENCY = 3;

export function automaticReportWindow(now = new Date()) {
  const today = toLondonDateInputValue(now);
  const [year, month, day] = today.split("-").map(Number);
  const previousNoonUtc = new Date(Date.UTC(year, month - 1, day - 1, 12, 0, 0));

  return {
    due: getLondonMinutesSinceMidnight(now) >= SIX_PM_MINUTES,
    matchDate: toLondonDateInputValue(previousNoonUtc),
  };
}

async function leaguesForMatchDate(matchDate: string) {
  const [year, month, day] = matchDate.split("-").map(Number);
  const nextNoonUtc = new Date(Date.UTC(year, month - 1, day + 1, 12, 0, 0));
  const nextDate = toLondonDateInputValue(nextNoonUtc);

  return prisma.league.findMany({
    where: {
      isActive: true,
      fixtures: {
        some: {
          publishedAt: { not: null },
          kickoffAt: {
            gte: parseLondonDateTime(matchDate, "00:00"),
            lt: parseLondonDateTime(nextDate, "00:00"),
          },
        },
      },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: MAX_LEAGUES_PER_RUN,
    select: { id: true, slug: true, name: true },
  });
}

async function existingPublicationStatus(leagueId: string, matchDate: string) {
  const rows = await prisma.$queryRaw<Array<{ status: string }>>`
    SELECT "status"::text AS "status"
    FROM "LeagueNewsArticle"
    WHERE "leagueId"=${leagueId} AND "matchDate"=${matchDate}
    LIMIT 1
  `;
  return rows[0]?.status ?? null;
}

async function ensureFreshDraft(slug: string, matchDate: string) {
  const source = await getReportSource(slug, matchDate);
  if (!source) throw new Error("League not found.");
  if (!source.matches.length) throw new Error("No completed matches are ready for the report.");
  if (source.pendingFixtures > 0 || source.omittedFixtures > 0) {
    throw new Error(
      `Report held: ${source.pendingFixtures} pending and ${source.omittedFixtures} omitted fixture(s) still need review.`,
    );
  }

  const hash = sourceHash(source);
  let stored = await readStoredReport(source.leagueId, matchDate);
  const fresh = Boolean(
    stored.draft?.content &&
    stored.draft.sourceHash === hash,
  );

  if (!fresh) {
    if (!reportConfigured()) {
      throw new Error("OpenAI is not configured for automatic matchnight reports.");
    }

    const input = {
      actorId: AUTO_REPORT_ACTOR,
      requestId: randomUUID(),
      baseVersion: stored.draft?.version ?? 0,
      source,
      sourceHash: hash,
      model: reportModel(),
    };
    const claim = await claimGeneration(input);

    if (!claim.cached) {
      try {
        const content = await writeOpenAiReport(source, input.model);
        await finishGeneration(input, claim.draftId, content);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Automatic report generation failed.";
        await failGeneration(input.requestId, message).catch(() => undefined);
        throw error;
      }
    }

    stored = await readStoredReport(source.leagueId, matchDate);
  }

  if (!stored.draft?.content || stored.draft.sourceHash !== hash) {
    throw new Error("The report facts changed during automatic generation; it will be retried.");
  }

  return { source, generated: !fresh };
}

async function processLeague(league: { id: string; slug: string; name: string }, matchDate: string) {
  const publicationStatus = await existingPublicationStatus(league.id, matchDate);
  if (publicationStatus === "PUBLISHED") {
    return { league: league.name, slug: league.slug, status: "already-published" as const, generated: false };
  }
  if (publicationStatus === "UNPUBLISHED") {
    return { league: league.name, slug: league.slug, status: "manually-unpublished" as const, generated: false };
  }

  const { generated } = await ensureFreshDraft(league.slug, matchDate);
  const publication = await publishNewsAutomatically({
    slug: league.slug,
    matchDate,
    actorId: AUTO_REPORT_ACTOR,
  });

  return {
    league: league.name,
    slug: league.slug,
    status: publication.automaticPublished ? "published" as const : publication.automaticReason,
    generated,
  };
}

async function runInBatches<T, R>(items: T[], work: (item: T) => Promise<R>) {
  const results: Array<PromiseSettledResult<R>> = [];
  for (let index = 0; index < items.length; index += CONCURRENCY) {
    const batch = items.slice(index, index + CONCURRENCY);
    results.push(...(await Promise.allSettled(batch.map(work))));
  }
  return results;
}

export async function runAutomaticMatchnightReports(now = new Date()) {
  const window = automaticReportWindow(now);
  if (!window.due) {
    return {
      due: false,
      matchDate: window.matchDate,
      checked: 0,
      published: 0,
      generated: 0,
      failed: 0,
      results: [],
    };
  }

  const leagues = await leaguesForMatchDate(window.matchDate);
  const settled = await runInBatches(
    leagues,
    league => processLeague(league, window.matchDate),
  );

  const results = settled.map((result, index) =>
    result.status === "fulfilled"
      ? result.value
      : {
          league: leagues[index]?.name ?? "Unknown league",
          slug: leagues[index]?.slug ?? "",
          status: "failed" as const,
          generated: false,
          error: result.reason instanceof Error ? result.reason.message : "Automatic report failed.",
        },
  );

  return {
    due: true,
    matchDate: window.matchDate,
    checked: leagues.length,
    published: results.filter(result => result.status === "published").length,
    generated: results.filter(result => result.generated).length,
    failed: results.filter(result => result.status === "failed").length,
    results,
  };
}
