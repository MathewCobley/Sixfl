// ========================================
// File: src/app/(admin)/admin/player-prospects/page.tsx
// ========================================

import Link from "next/link";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Player Prospects | SIXFL Admin",
};

function formatDate(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getProspectName(input: { firstName: string; lastName: string | null }) {
  return [input.firstName, input.lastName].filter(Boolean).join(" ").trim() || "Unnamed player";
}

function normaliseEmail(value: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function buildActiveSquadKey(input: { email: string | null; teamId: string }) {
  const email = normaliseEmail(input.email);
  return email ? `${email}::${input.teamId}` : null;
}

function getStatusClasses(status: string) {
  switch (status) {
    case "NEW":
      return "border-white/10 bg-white/5 text-white/75";
    case "CONTACTED":
      return "border-sky-400/25 bg-sky-500/10 text-sky-100";
    case "TRIAL":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    case "ACTIVE_SQUAD":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "BACKUP":
      return "border-violet-400/25 bg-violet-500/10 text-violet-100";
    case "DECLINED":
      return "border-red-400/25 bg-red-500/10 text-red-100";
    default:
      return "border-white/10 bg-white/5 text-white/75";
  }
}

function formatStatus(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function StatCard({
  label,
  value,
  helper,
  tone = "white",
}: {
  label: string;
  value: number;
  helper: string;
  tone?: "white" | "emerald" | "amber" | "sky";
}) {
  const toneClasses =
    tone === "emerald"
      ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100/70"
      : tone === "amber"
        ? "border-amber-400/20 bg-amber-500/10 text-amber-100/70"
        : tone === "sky"
          ? "border-sky-400/20 bg-sky-500/10 text-sky-100/70"
          : "border-white/10 bg-white/[0.04] text-white/45";

  return (
    <div className={`rounded-3xl border p-5 ${toneClasses}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm text-white/55">{helper}</p>
    </div>
  );
}

export default async function AdminPlayerProspectsPage() {
  await requireAdmin();

  const prospects = await prisma.teamPlayerProspect.findMany({
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    include: {
      team: {
        select: {
          id: true,
          name: true,
          teamMode: true,
          league: {
            select: {
              name: true,
              season: true,
            },
          },
        },
      },
    },
  });

  const prospectEmails = Array.from(
    new Set(
      prospects
        .map((prospect) => normaliseEmail(prospect.email))
        .filter(Boolean),
    ),
  );

  const linkedSquadUsers = prospectEmails.length
    ? await prisma.user.findMany({
        where: {
          email: {
            in: prospectEmails,
          },
        },
        select: {
          email: true,
          teamMembers: {
            select: {
              teamId: true,
            },
          },
        },
      })
    : [];

  const activeSquadMembershipKeys = new Set<string>();

  for (const user of linkedSquadUsers) {
    const email = normaliseEmail(user.email);

    if (!email) {
      continue;
    }

    for (const membership of user.teamMembers) {
      activeSquadMembershipKeys.add(`${email}::${membership.teamId}`);
    }
  }

  const isActivelyUsedProspect = (prospect: (typeof prospects)[number]) => {
    if (prospect.status === "ACTIVE_SQUAD") {
      return true;
    }

    const activeSquadKey = buildActiveSquadKey({
      email: prospect.email,
      teamId: prospect.teamId,
    });

    return activeSquadKey ? activeSquadMembershipKeys.has(activeSquadKey) : false;
  };

  const pipelineProspects = prospects.filter(
    (prospect) => !isActivelyUsedProspect(prospect) && prospect.status !== "DECLINED",
  );
  const newProspects = pipelineProspects.filter((prospect) => prospect.status === "NEW");
  const trialProspects = pipelineProspects.filter((prospect) => prospect.status === "TRIAL");
  const activeSquadProspects = prospects.filter(isActivelyUsedProspect);
  const declinedProspects = prospects.filter(
    (prospect) => !isActivelyUsedProspect(prospect) && prospect.status === "DECLINED",
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-8 lg:py-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              SIXFL pipeline
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Player prospects
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-white/70 sm:text-base">
              Admin-owned view of individual players who may join a team. Players already promoted or linked to active squads are hidden from this working list.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard label="Open" value={pipelineProspects.length} helper="Still in the pipeline" tone="emerald" />
            <StatCard label="New" value={newProspects.length} helper="Not yet processed" />
            <StatCard label="Trial" value={trialProspects.length} helper="May be joining" tone="amber" />
            <StatCard label="Active hidden" value={activeSquadProspects.length} helper="Already in squads" tone="sky" />
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Open player prospects</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Pipeline list</h2>
          </div>
          <div className="text-sm text-white/50">
            {pipelineProspects.length} shown · {activeSquadProspects.length} active hidden
            {declinedProspects.length ? ` · ${declinedProspects.length} declined hidden` : ""}
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {pipelineProspects.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-sm text-white/55">
              No open player prospects yet.
            </div>
          ) : null}

          {pipelineProspects.map((prospect) => {
            const name = getProspectName(prospect);
            const teamLeague = prospect.team.league
              ? `${prospect.team.league.name}${prospect.team.league.season ? ` · ${prospect.team.league.season}` : ""}`
              : "No league assigned";

            return (
              <article
                key={prospect.id}
                className="rounded-3xl border border-white/10 bg-black/20 p-5 transition hover:border-emerald-400/20 hover:bg-black/25"
              >
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_auto] lg:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-white">{name}</h3>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getStatusClasses(prospect.status)}`}>
                        {formatStatus(prospect.status)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/45">
                      {prospect.email ? <span>{prospect.email}</span> : null}
                      {prospect.phone ? <span>{prospect.phone}</span> : null}
                      {prospect.source ? <span>Source: {prospect.source}</span> : null}
                    </div>
                    {prospect.preferredPositions || prospect.availabilitySummary ? (
                      <p className="mt-3 text-sm leading-6 text-white/60">
                        {[prospect.preferredPositions, prospect.availabilitySummary].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                  </div>

                  <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Linked team</div>
                    <Link href={`/admin/teams/${prospect.team.id}/prospects`} className="mt-2 block font-semibold text-emerald-200 hover:text-emerald-100">
                      {prospect.team.name}
                    </Link>
                    <div className="mt-1 text-sm text-white/45">{teamLeague}</div>
                    <div className="mt-2 text-xs text-white/35">Mode: {prospect.team.teamMode}</div>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <Link
                      href={`/admin/teams/${prospect.team.id}/prospects`}
                      className="inline-flex items-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
                    >
                      Manage
                    </Link>
                    <Link
                      href={`/admin/teams/${prospect.team.id}/prospects/${prospect.id}/communications`}
                      className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10"
                    >
                      Comms
                    </Link>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/35">
                  <span>Added {formatDate(prospect.createdAt)}</span>
                  <span>Updated {formatDate(prospect.updatedAt)}</span>
                  {prospect.lastContactedAt ? <span>Last contacted {formatDate(prospect.lastContactedAt)}</span> : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
