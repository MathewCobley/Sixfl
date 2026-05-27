// ========================================
// File: src/app/(admin)/admin/player-responses/page.tsx
// ========================================

import Link from "next/link";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Player Responses | SIXFL",
};

type SearchParams = Promise<{
  response?: string;
  teamId?: string;
}>;

type PlayerInterestResponseRow = {
  id: string;
  response: string;
  respondedAt: Date;
  teamId: string;
  teamName: string;
  teamMemberId: string | null;
  prospectId: string | null;
  playerName: string | null;
  playerEmail: string | null;
  prospectName: string | null;
  prospectEmail: string | null;
  prospectPhone: string | null;
};

function formatResponseDate(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function responseLabel(value: string) {
  if (value === "YES") return "YES — still wants to play";
  if (value === "NO") return "NO — remove / follow up";
  return value;
}

function responseClasses(value: string) {
  if (value === "YES") {
    return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
  }

  if (value === "NO") {
    return "border-red-400/25 bg-red-500/10 text-red-100";
  }

  return "border-white/10 bg-white/[0.04] text-white/65";
}

function getDisplayName(row: PlayerInterestResponseRow) {
  return (
    row.playerName?.trim() ||
    row.playerEmail?.trim() ||
    row.prospectName?.trim() ||
    row.prospectEmail?.trim() ||
    row.prospectPhone?.trim() ||
    "Unknown player"
  );
}

function getContact(row: PlayerInterestResponseRow) {
  return [row.playerEmail, row.prospectEmail, row.prospectPhone]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" · ");
}

async function getResponses(input: { response?: string; teamId?: string }) {
  const response = input.response === "YES" || input.response === "NO" ? input.response : null;
  const teamId = input.teamId?.trim() || null;

  try {
    return await prisma.$queryRaw<PlayerInterestResponseRow[]>`
      SELECT
        response."id",
        response."response",
        response."respondedAt",
        response."teamId",
        team."name" AS "teamName",
        response."teamMemberId",
        response."prospectId",
        memberUser."name" AS "playerName",
        memberUser."email" AS "playerEmail",
        NULLIF(TRIM(CONCAT(prospect."firstName", ' ', COALESCE(prospect."lastName", ''))), '') AS "prospectName",
        prospect."email" AS "prospectEmail",
        prospect."phone" AS "prospectPhone"
      FROM "PlayerInterestResponse" response
      INNER JOIN "Team" team ON team."id" = response."teamId"
      LEFT JOIN "TeamMember" member ON member."id" = response."teamMemberId"
      LEFT JOIN "User" memberUser ON memberUser."id" = member."userId"
      LEFT JOIN "TeamPlayerProspect" prospect ON prospect."id" = response."prospectId"
      WHERE (${response}::text IS NULL OR response."response" = ${response})
        AND (${teamId}::text IS NULL OR response."teamId" = ${teamId})
      ORDER BY response."respondedAt" DESC
      LIMIT 500
    `;
  } catch (error) {
    console.error("Could not load player interest responses", error);
    return null;
  }
}

export default async function AdminPlayerResponsesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();

  const sp = await searchParams;
  const [responses, teams] = await Promise.all([
    getResponses({ response: sp.response, teamId: sp.teamId }),
    prisma.team.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        league: { select: { name: true, season: true } },
      },
    }),
  ]);

  const responseRows = responses ?? [];
  const yesCount = responseRows.filter((row) => row.response === "YES").length;
  const noCount = responseRows.filter((row) => row.response === "NO").length;
  const selectedTeam = teams.find((team) => team.id === sp.teamId) ?? null;

  function filterHref(input: { response?: string; teamId?: string | null }) {
    const params = new URLSearchParams();
    if (input.response) params.set("response", input.response);
    if (input.teamId) params.set("teamId", input.teamId);
    const query = params.toString();
    return `/admin/player-responses${query ? `?${query}` : ""}`;
  }

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-6 py-6 text-white">
      <section className="rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
          Squad player responses
        </p>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Yes / No player replies
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
              See who clicked the buttons from the “Yes, I want to play” squad email. YES means they still want to play. NO means they should be removed from the active playing list or followed up before selection.
            </p>
          </div>
          <Link
            href="/admin/templates/quick/yes-i-want-to-play"
            className="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
          >
            Open email template
          </Link>
        </div>
      </section>

      {responses === null ? (
        <section className="rounded-3xl border border-amber-400/25 bg-amber-500/10 p-5 text-sm leading-6 text-amber-100">
          The response table is not available yet. Run the latest Prisma migration, then reload this page.
          <pre className="mt-3 overflow-x-auto rounded-2xl border border-amber-400/20 bg-black/25 p-3 text-xs text-amber-50">
            npx prisma migrate deploy
          </pre>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Shown</p>
          <p className="mt-3 text-3xl font-semibold text-white">{responseRows.length}</p>
          <p className="mt-2 text-sm text-white/50">Latest response records.</p>
        </div>
        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">Still wants to play</p>
          <p className="mt-3 text-3xl font-semibold text-white">{yesCount}</p>
          <p className="mt-2 text-sm text-emerald-100/70">YES responses in this view.</p>
        </div>
        <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-100/70">Remove / follow up</p>
          <p className="mt-3 text-3xl font-semibold text-white">{noCount}</p>
          <p className="mt-2 text-sm text-red-100/70">NO responses in this view.</p>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <Link href={filterHref({ teamId: sp.teamId })} className={`rounded-full border px-4 py-2 text-sm font-medium transition ${!sp.response ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-black/20 text-white/65 hover:bg-white/[0.06]"}`}>All</Link>
            <Link href={filterHref({ response: "YES", teamId: sp.teamId })} className={`rounded-full border px-4 py-2 text-sm font-medium transition ${sp.response === "YES" ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-black/20 text-white/65 hover:bg-white/[0.06]"}`}>YES</Link>
            <Link href={filterHref({ response: "NO", teamId: sp.teamId })} className={`rounded-full border px-4 py-2 text-sm font-medium transition ${sp.response === "NO" ? "border-red-400/35 bg-red-500/10 text-red-100" : "border-white/10 bg-black/20 text-white/65 hover:bg-white/[0.06]"}`}>NO</Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedTeam ? (
              <Link href={filterHref({ response: sp.response })} className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/65 transition hover:bg-white/[0.06]">Clear team: {selectedTeam.name}</Link>
            ) : null}
            {teams.slice(0, 8).map((team) => (
              <Link key={team.id} href={filterHref({ response: sp.response, teamId: team.id })} className={`rounded-full border px-3 py-2 text-xs font-medium transition ${sp.teamId === team.id ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-black/20 text-white/55 hover:bg-white/[0.06]"}`}>
                {team.name}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-xl font-semibold text-white">Responses</h2>
          <p className="mt-1 text-sm text-white/50">Newest first.</p>
        </div>

        <div className="divide-y divide-white/10">
          {responseRows.length === 0 ? (
            <div className="px-5 py-10 text-sm text-white/55">No responses found for this filter yet.</div>
          ) : null}

          {responseRows.map((row) => {
            const name = getDisplayName(row);
            const contact = getContact(row);
            const commsHref = row.teamMemberId
              ? `/admin/teams/${row.teamId}/players/${row.teamMemberId}/communications`
              : row.prospectId
                ? `/admin/teams/${row.teamId}/prospects/${row.prospectId}/communications`
                : `/admin/teams/${row.teamId}`;

            return (
              <div key={row.id} className="grid gap-4 px-5 py-5 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${responseClasses(row.response)}`}>
                      {responseLabel(row.response)}
                    </span>
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/60">
                      {row.teamMemberId ? "Squad player" : "Prospect"}
                    </span>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-white">{name}</h3>
                  <p className="mt-1 text-sm text-white/55">
                    {row.teamName}{contact ? ` · ${contact}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-white/40">Responded {formatResponseDate(row.respondedAt)}</p>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Link href={commsHref} className="inline-flex items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15">
                    Open communications
                  </Link>
                  <Link href={`/admin/teams/${row.teamId}`} className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/[0.08]">
                    Open team
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
