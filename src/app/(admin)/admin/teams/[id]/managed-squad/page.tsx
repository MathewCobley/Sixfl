// ========================================
// File: src/app/(admin)/admin/teams/[id]/managed-squad/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  getManagedSquadInviteCandidates,
  MANAGED_SQUAD_INVITE_SOURCE_TYPE,
} from "@/lib/managed-squads/invitations";
import { sendTuesdayManagedSquadInvitesAction } from "../../../managed-squads/actions";

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    managedSquadSent?: string;
    managedSquadQueued?: string;
    managedSquadSkipped?: string;
    managedSquadCandidates?: string;
    managedSquadError?: string;
  }>;
};

function formatLeagueName(team: {
  league: { name: string; season: string | null } | null;
}) {
  if (!team.league) return "No league assigned";
  return `${team.league.name}${team.league.season ? ` — ${team.league.season}` : ""}`;
}

function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "green" | "red" | "amber";
}) {
  const toneClass =
    tone === "green"
      ? "text-emerald-300"
      : tone === "red"
        ? "text-red-300"
        : tone === "amber"
          ? "text-amber-300"
          : "text-white";

  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="text-xs font-medium uppercase tracking-[0.18em] text-white/35">
        {label}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

export default async function AdminTeamManagedSquadPage({
  params,
  searchParams,
}: Props) {
  await requireAdmin();

  const { id } = await params;
  const sp = (await searchParams) ?? {};

  const team = await prisma.team.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      teamMode: true,
      isRecruiting: true,
      league: {
        select: {
          name: true,
          season: true,
        },
      },
      _count: {
        select: {
          prospects: true,
        },
      },
    },
  });

  if (!team) {
    notFound();
  }

  const [{ candidates }, invitesSent, interested, notInterested] =
    await Promise.all([
      getManagedSquadInviteCandidates(team.id),
      prisma.notificationDispatch.count({
        where: {
          sourceType: MANAGED_SQUAD_INVITE_SOURCE_TYPE,
          sourceId: team.id,
        },
      }),
      prisma.notificationDispatch.count({
        where: {
          sourceType: MANAGED_SQUAD_INVITE_SOURCE_TYPE,
          sourceId: team.id,
          metadata: {
            path: ["response"],
            equals: "yes",
          },
        },
      }),
      prisma.notificationDispatch.count({
        where: {
          sourceType: MANAGED_SQUAD_INVITE_SOURCE_TYPE,
          sourceId: team.id,
          metadata: {
            path: ["response"],
            equals: "no",
          },
        },
      }),
    ]);

  const isManagedTeam = team.teamMode === "MANAGED";
  const teamUrl = `/admin/teams/${team.id}`;
  const currentUrl = `/admin/teams/${team.id}/managed-squad`;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Link
            href={teamUrl}
            className="text-sm text-emerald-300 hover:text-emerald-200"
          >
            ← Back to team
          </Link>

          <div className="text-sm text-emerald-300">Managed squad recruitment</div>
          <h1 className="text-3xl font-semibold text-white">{team.name}</h1>
          <p className="max-w-3xl text-sm leading-6 text-white/60">
            Send the Tuesday managed squad interest email from inside this team.
            The flow uses existing team prospects plus suitable player interest
            leads, then records yes/no responses automatically.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/admin/teams/${team.id}/prospects`}
            className="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
          >
            View prospects
          </Link>
          <Link
            href="/admin/managed-squads"
            className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
          >
            All managed squads
          </Link>
        </div>
      </div>

      {(sp.managedSquadSent === "1" || sp.managedSquadError) && (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm">
          {sp.managedSquadSent === "1" ? (
            <div className="text-emerald-300">
              Tuesday managed squad emails queued. Queued:{" "}
              {sp.managedSquadQueued ?? "0"}. Skipped recent duplicates:{" "}
              {sp.managedSquadSkipped ?? "0"}. Candidate pool:{" "}
              {sp.managedSquadCandidates ?? candidates.length}.
            </div>
          ) : null}

          {sp.managedSquadError === "missing-team" ? (
            <div className="text-red-300">No managed team was selected.</div>
          ) : null}

          {sp.managedSquadError === "send-failed" ? (
            <div className="text-red-300">
              The managed squad emails could not be queued. Check email settings
              and try again.
            </div>
          ) : null}
        </div>
      )}

      {!isManagedTeam ? (
        <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-6 text-amber-50 md:p-8">
          <h2 className="text-xl font-semibold text-white">
            This team is not set as a managed team yet
          </h2>
          <p className="mt-3 text-sm leading-6 text-amber-50/80">
            Open the main team settings, change Team mode to Managed, and save.
            The managed squad email flow will then be available here.
          </p>
          <Link
            href={teamUrl}
            className="mt-5 inline-flex rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-300"
          >
            Open team settings
          </Link>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-5">
        <MetricCard label="team prospects" value={team._count.prospects} />
        <MetricCard label="eligible candidates" value={candidates.length} />
        <MetricCard label="invites sent" value={invitesSent} />
        <MetricCard label="interested" value={interested} tone="green" />
        <MetricCard label="not interested" value={notInterested} tone="red" />
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)] md:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm text-white/45">{formatLeagueName(team)}</div>
            <h2 className="mt-2 text-xl font-semibold text-white">
              Tuesday availability check
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
              Sends to deduped eligible candidates. Existing prospects are
              included first, then player leads who selected Tuesday, any night,
              or have no preferred night. Anyone emailed in the last 7 days is
              skipped to avoid accidental duplicate chasing.
            </p>
          </div>

          <form action={sendTuesdayManagedSquadInvitesAction}>
            <input type="hidden" name="teamId" value={team.id} />
            <input type="hidden" name="returnTo" value={currentUrl} />
            <button
              type="submit"
              disabled={!isManagedTeam || candidates.length === 0}
              className={
                isManagedTeam && candidates.length > 0
                  ? "inline-flex items-center justify-center rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-400"
                  : "inline-flex cursor-not-allowed items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/35"
              }
            >
              Send Tuesday email
            </button>
          </form>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-4">
          <h3 className="text-sm font-semibold text-white">Email content</h3>
          <p className="mt-2 text-sm leading-6 text-white/55">
            The email asks whether they want to join a new managed SIXFL team
            and whether they can commit to at least some Tuesdays. The yes link
            opens a short form for availability, position, mobile number and
            notes. The no link records that they are not interested.
          </p>
        </div>
      </div>
    </div>
  );
}
