// ========================================
// File: src/app/(admin)/admin/teams/onboarding/page.tsx
// ========================================

import Link from "next/link";

import { getTeamOnboardingSummaries } from "@/lib/captain/onboarding";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Captain Onboarding | SIXFL Admin",
};

function formatDate(value: Date | null) {
  if (!value) return "—";

  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminCaptainOnboardingPage() {
  await requireAdmin();

  const teams = await prisma.team.findMany({
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      league: {
        select: {
          name: true,
          season: true,
        },
      },
      members: {
        where: { role: "CAPTAIN" },
        select: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
        take: 1,
      },
    },
  });

  const onboardingByTeamId = await getTeamOnboardingSummaries(teams.map((team) => team.id));
  const acceptedCount = teams.filter((team) => onboardingByTeamId.get(team.id)?.captainAgreementAcceptedAt).length;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/75">
            Team setup
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-white">
            Captain onboarding
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
            Check which captains have accepted the captain agreement and whether onboarding emails have been sent.
          </p>
        </div>

        <Link
          href="/admin/teams"
          className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/10"
        >
          Back to teams
        </Link>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
            Total teams
          </p>
          <p className="mt-3 text-3xl font-semibold text-white">{teams.length}</p>
        </div>
        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
            Agreements accepted
          </p>
          <p className="mt-3 text-3xl font-semibold text-white">{acceptedCount}</p>
        </div>
        <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-100/70">
            Still to accept
          </p>
          <p className="mt-3 text-3xl font-semibold text-white">{teams.length - acceptedCount}</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
        <div className="grid gap-4 border-b border-white/10 px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-white/45 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div>Team</div>
          <div>Captain</div>
          <div>Agreement</div>
          <div>Onboarding emails</div>
        </div>

        <div className="divide-y divide-white/10">
          {teams.map((team) => {
            const onboarding = onboardingByTeamId.get(team.id);
            const captain = team.members[0]?.user ?? null;
            const leagueLabel = team.league
              ? `${team.league.name}${team.league.season ? ` · ${team.league.season}` : ""}`
              : "No league assigned";
            const accepted = Boolean(onboarding?.captainAgreementAcceptedAt);

            return (
              <div
                key={team.id}
                className="grid gap-4 px-6 py-5 text-sm md:grid-cols-[1.3fr_1fr_1fr_1fr] md:items-center"
              >
                <div className="min-w-0">
                  <Link
                    href={`/captain/team/${team.id}`}
                    className="font-semibold text-white transition hover:text-emerald-200"
                  >
                    {team.name}
                  </Link>
                  <p className="mt-1 text-xs text-white/45">{leagueLabel}</p>
                </div>

                <div className="min-w-0 text-white/65">
                  <div>{captain?.name ?? "—"}</div>
                  <div className="break-all text-xs text-white/45">{captain?.email ?? "No captain email"}</div>
                </div>

                <div>
                  <span
                    className={[
                      "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
                      accepted
                        ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                        : "border-amber-400/25 bg-amber-500/10 text-amber-100",
                    ].join(" ")}
                  >
                    {accepted ? "Accepted" : "Not accepted"}
                  </span>
                  <p className="mt-2 text-xs text-white/45">
                    {formatDate(onboarding?.captainAgreementAcceptedAt ?? null)}
                  </p>
                </div>

                <div className="space-y-1 text-xs text-white/55">
                  <div>Welcome: {formatDate(onboarding?.onboardingWelcomeEmailSentAt ?? null)}</div>
                  <div>First fixture: {formatDate(onboarding?.onboardingFirstFixtureEmailSentAt ?? null)}</div>
                  <div>Post match: {formatDate(onboarding?.onboardingPostFirstMatchEmailSentAt ?? null)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
