// ========================================
// File: src/app/(admin)/admin/messaging/reassign/[threadId]/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";

import { reassignMessageThreadTeamAction } from "@/app/(admin)/admin/messages/actions";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ threadId: string }>;
  searchParams?: Promise<{ filter?: string; q?: string }>;
};

function formatThreadTitle(thread: {
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  team: { name: string } | null;
}) {
  return (
    thread.contactName ||
    thread.contactEmail ||
    thread.contactPhone ||
    thread.team?.name ||
    "Unknown contact"
  );
}

export default async function ReassignMessageThreadPage({ params, searchParams }: PageProps) {
  await requireAdmin();

  const { threadId } = await params;
  const sp = (await searchParams) ?? {};
  const filter = sp.filter?.trim() || "open";
  const q = sp.q?.trim() || "";

  const [thread, teams] = await Promise.all([
    prisma.messageThread.findUnique({
      where: { id: threadId },
      select: {
        id: true,
        contactName: true,
        contactEmail: true,
        contactPhone: true,
        phoneNormalized: true,
        teamId: true,
        leagueId: true,
        team: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
          },
        },
        league: {
          select: {
            id: true,
            name: true,
            season: true,
          },
        },
      },
    }),
    prisma.team.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { contactName: { contains: q, mode: "insensitive" } },
              { contactEmail: { contains: q, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: [{ name: "asc" }],
      take: q ? 40 : 80,
      select: {
        id: true,
        name: true,
        logoUrl: true,
        teamMode: true,
        league: {
          select: {
            name: true,
            season: true,
          },
        },
      },
    }),
  ]);

  if (!thread) notFound();

  const title = formatThreadTitle(thread);
  const backHref = `/admin/messaging?filter=${encodeURIComponent(filter)}&thread=${encodeURIComponent(thread.id)}`;

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.3)] lg:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
          Thread tools
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
          Reassign conversation
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
          Move this conversation away from the wrong team, or unlink it completely. Messages are not deleted.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href={backHref}
            className="inline-flex items-center rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-medium text-white/80 transition hover:bg-white/5 hover:text-white"
          >
            Back to conversation
          </Link>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Current conversation
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">{title}</h2>
            <div className="mt-4 space-y-2 text-sm text-white/60">
              <p>Phone: {thread.contactPhone || thread.phoneNormalized || "—"}</p>
              <p>Email: {thread.contactEmail || "—"}</p>
              <p>Current team: {thread.team?.name || "No team linked"}</p>
              <p>
                Current league:{" "}
                {thread.league
                  ? `${thread.league.name}${thread.league.season ? ` · ${thread.league.season}` : ""}`
                  : "No league linked"}
              </p>
            </div>
          </div>

          <form action={reassignMessageThreadTeamAction} className="rounded-3xl border border-red-400/20 bg-red-500/10 p-5">
            <input type="hidden" name="threadId" value={thread.id} />
            <input type="hidden" name="filter" value={filter} />
            <input type="hidden" name="teamId" value="" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-100/70">
              Remove team link
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">Unlink this conversation</h2>
            <p className="mt-2 text-sm leading-6 text-red-100/75">
              Use this if the conversation should not belong to any team. It will stop the old team name appearing on the thread.
            </p>
            <button
              type="submit"
              className="mt-4 inline-flex items-center rounded-xl border border-red-400/30 bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-50 transition hover:bg-red-500/20"
            >
              Unlink from team
            </button>
          </form>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Move to correct team
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">Choose the right team</h2>
            </div>
            <form className="flex gap-2" action={`/admin/messaging/reassign/${thread.id}`}>
              <input type="hidden" name="filter" value={filter} />
              <input
                name="q"
                defaultValue={q}
                placeholder="Search teams..."
                className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-emerald-400/40"
              />
              <button className="h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-white hover:bg-white/10">
                Search
              </button>
            </form>
          </div>

          <div className="mt-5 max-h-[680px] space-y-3 overflow-y-auto pr-1">
            {teams.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/55">
                No teams found.
              </div>
            ) : null}

            {teams.map((team) => (
              <form
                key={team.id}
                action={reassignMessageThreadTeamAction}
                className={`rounded-2xl border p-4 transition ${
                  team.id === thread.teamId
                    ? "border-emerald-400/30 bg-emerald-500/10"
                    : "border-white/10 bg-black/20 hover:bg-white/[0.04]"
                }`}
              >
                <input type="hidden" name="threadId" value={thread.id} />
                <input type="hidden" name="filter" value={filter} />
                <input type="hidden" name="teamId" value={team.id} />
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] text-xs font-bold text-white/70">
                    {team.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={team.logoUrl} alt={team.name} className="h-full w-full object-cover" />
                    ) : (
                      team.name.slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white">{team.name}</div>
                    <div className="mt-1 text-xs text-white/45">
                      {team.league
                        ? `${team.league.name}${team.league.season ? ` · ${team.league.season}` : ""}`
                        : "No league"}
                      {team.teamMode === "MANAGED" ? " · Managed" : ""}
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={team.id === thread.teamId}
                    className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {team.id === thread.teamId ? "Current" : "Move here"}
                  </button>
                </div>
              </form>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
