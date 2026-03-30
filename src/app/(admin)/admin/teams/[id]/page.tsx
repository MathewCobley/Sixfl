// ========================================
// File: src/app/admin/teams/[id]/page.tsx
// ========================================

// ========================================
// Imports
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  deleteTeamAction,
  regenerateClaimCodeAction,
  updateTeamDetailsAction,
} from "../actions";
import ConfirmDeleteButton from "@/components/admin/ConfirmDeleteButton";
import CopyToClipboardButton from "@/components/admin/CopyToClipboardButton";
import TeamBadge from "@/components/admin/TeamBadge";

// ========================================
// Types
// ========================================

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    error?: string;
    regenerated?: string;
    saved?: string;
  }>;
};

// ========================================
// Page
// ========================================

export default async function AdminTeamPage({
  params,
  searchParams,
}: Props) {
  await requireAdmin();

  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const error = sp.error;
  const regenerated = sp.regenerated === "1";
  const saved = sp.saved === "1";

  if (!id) {
    notFound();
  }

  const [team, leagues] = await Promise.all([
    prisma.team.findUnique({
      where: { id },
      include: {
        members: {
          where: { role: "MANAGER" },
          include: {
            user: {
              select: {
                email: true,
                name: true,
                role: true,
              },
            },
          },
        },
        league: {
          select: {
            id: true,
            name: true,
            season: true,
            slug: true,
          },
        },
      },
    }),
    prisma.league.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }, { season: "asc" }],
      select: {
        id: true,
        name: true,
        season: true,
        isActive: true,
      },
    }),
  ]);

  if (!team) {
    notFound();
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const claimLink = `${baseUrl}/claim?code=${encodeURIComponent(team.claimCode)}`;

  const managerUser = team.members[0]?.user;
  const hasManager = Boolean(managerUser?.email);
  const claimedByCaptain = hasManager && managerUser?.role !== UserRole.ADMIN;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Link
            href="/admin/teams"
            className="text-sm text-emerald-300 hover:text-emerald-200"
          >
            ← Back to teams
          </Link>

          <h1 className="text-3xl font-semibold text-white">{team.name}</h1>

          <p className="text-sm text-white/60">
            Admin view for this team. Manage league assignment, branding,
            captain claim status, and team access.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {team.league ? (
            <Link
              href={`/admin/leagues/${team.league.id}`}
              className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
            >
              Open league
            </Link>
          ) : null}

          <Link
            href="/admin/teams"
            className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
          >
            All teams
          </Link>
        </div>
      </div>

      {(saved || regenerated || error) && (
        <div className="space-y-1 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm">
          {saved ? (
            <div className="text-emerald-300">Team details updated.</div>
          ) : null}

          {regenerated ? (
            <div className="text-emerald-300">
              New claim code generated and the team was unclaimed.
            </div>
          ) : null}

          {error === "has_fixtures" ? (
            <div className="text-red-300">
              Can’t delete this team because fixtures already exist for it.
            </div>
          ) : null}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <TeamBadge name={team.name} logoUrl={team.logoUrl} size="lg" />

              <div className="space-y-1">
                <div>
                  <div className="text-sm text-white/60">Team name</div>
                  <div className="text-lg text-white">{team.name}</div>
                </div>

                <div className="text-sm text-white/60">
                  {team.league
                    ? `${team.league.name}${
                        team.league.season ? ` — ${team.league.season}` : ""
                      }`
                    : "No league assigned"}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
            <h2 className="mb-6 text-lg font-semibold text-white">
              Team settings
            </h2>

            <form action={updateTeamDetailsAction} className="space-y-5">
              <input type="hidden" name="id" value={team.id} />

              <div className="space-y-2">
                <label htmlFor="leagueId" className="text-sm text-white/60">
                  League
                </label>

                <select
                  id="leagueId"
                  name="leagueId"
                  defaultValue={team.leagueId ?? ""}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60"
                >
                  <option value="">No league</option>
                  {leagues.map((league) => (
                    <option key={league.id} value={league.id}>
                      {league.name}
                      {league.season ? ` — ${league.season}` : ""}
                      {league.isActive ? "" : " (inactive)"}
                    </option>
                  ))}
                </select>

                <div className="text-xs text-white/50">
                  Current:{" "}
                  {team.league
                    ? `${team.league.name}${
                        team.league.season ? ` — ${team.league.season}` : ""
                      }`
                    : "No league assigned"}
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="logoUrl" className="text-sm text-white/60">
                  Logo URL
                </label>

                <input
                  id="logoUrl"
                  name="logoUrl"
                  type="text"
                  defaultValue={team.logoUrl ?? ""}
                  placeholder="/team-logos/ripon-rovers.png"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
                />

                <div className="text-xs text-white/50">
                  Use a path from{" "}
                  <span className="font-mono text-white/70">
                    public/team-logos
                  </span>
                  , for example{" "}
                  <span className="font-mono text-white/70">
                    /team-logos/ripon-rovers.png
                  </span>
                </div>

                <div className="text-xs text-white/50">
                  Current:{" "}
                  <span className="font-mono text-white/70">
                    {team.logoUrl || "No logo set"}
                  </span>
                </div>
              </div>

              <button
                type="submit"
                className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
              >
                Save team details
              </button>
            </form>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">Team snapshot</h2>

            <div className="mt-4 space-y-4 text-sm text-white/70">
              <div className="flex items-center justify-between">
                <span>League</span>
                <span className="text-right font-medium text-white">
                  {team.league
                    ? `${team.league.name}${
                        team.league.season ? ` — ${team.league.season}` : ""
                      }`
                    : "—"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span>Captain status</span>
                <span className="font-medium text-white">
                  {!hasManager
                    ? "Unclaimed"
                    : claimedByCaptain
                      ? "Claimed"
                      : "Managed by admin"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span>Captain email</span>
                <span className="text-right font-medium text-white">
                  {managerUser?.email ?? "—"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span>Team ID</span>
                <span className="font-mono text-xs text-white">{team.id}</span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">Captain access</h2>

            <div className="mt-4 space-y-4">
              <div>
                <div className="text-sm text-white/60">Claim code</div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="font-mono text-sm text-white/80">
                    {team.claimCode}
                  </div>
                  <CopyToClipboardButton
                    text={team.claimCode}
                    label="Copy code"
                    className="rounded-md border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
                  />
                </div>
              </div>

              <div>
                <div className="text-sm text-white/60">Claim link</div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <a
                    href={claimLink}
                    className="break-all text-sm text-emerald-400 underline underline-offset-4 hover:text-emerald-300"
                  >
                    {claimLink}
                  </a>
                  <CopyToClipboardButton
                    text={claimLink}
                    label="Copy link"
                    className="rounded-md border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-yellow-500/30 bg-yellow-500/5 p-6">
            <h2 className="text-lg font-semibold text-yellow-200">
              Regenerate captain code
            </h2>

            <p className="mt-2 text-sm text-white/60">
              Regenerating the claim code invalidates the old link and unclaims
              the team by removing the current manager assignment.
            </p>

            <form action={regenerateClaimCodeAction} className="mt-5">
              <input type="hidden" name="id" value={team.id} />
              <input type="hidden" name="from" value={`/admin/teams/${team.id}`} />
              <ConfirmDeleteButton
                label="Regenerate claim code"
                confirmText={`Regenerate claim code for "${team.name}" and unclaim the team?`}
                className="rounded-md bg-yellow-600 px-4 py-2 text-black hover:bg-yellow-500"
              />
            </form>
          </div>

          <div className="rounded-3xl border border-red-500/30 bg-red-500/5 p-6">
            <h2 className="text-lg font-semibold text-red-400">Danger zone</h2>

            <p className="mt-2 text-sm text-white/60">
              Deleting a team cannot be undone.
            </p>

            <form action={deleteTeamAction} className="mt-5">
              <input type="hidden" name="id" value={team.id} />
              <input type="hidden" name="from" value={`/admin/teams/${team.id}`} />
              <ConfirmDeleteButton
                label="Delete team"
                confirmText={`Delete "${team.name}"? This cannot be undone.`}
                className="rounded-md bg-red-600 px-4 py-2 text-white hover:bg-red-500"
              />
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}