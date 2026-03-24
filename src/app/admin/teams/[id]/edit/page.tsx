// ========================================
// File: src/app/admin/teams/[id]/edit/page.tsx
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
} from "../../actions";
import ConfirmDeleteButton from "@/components/admin/ConfirmDeleteButton";
import CopyToClipboardButton from "@/components/admin/CopyToClipboardButton";
import TeamBadge from "@/components/admin/TeamBadge";

export default async function AdminTeamEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string; regenerated?: string; saved?: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const error = sp.error;
  const regenerated = sp.regenerated === "1";
  const saved = sp.saved === "1";

  if (!id) notFound();

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

  if (!team) notFound();

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const claimLink = `${baseUrl}/claim?code=${encodeURIComponent(team.claimCode)}`;

  const managerUser = team.members[0]?.user;
  const hasManager = Boolean(managerUser?.email);
  const claimedByCaptain = hasManager && managerUser?.role !== UserRole.ADMIN;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Edit Team</h1>

        <Link
          href="/admin/teams"
          className="rounded-md border border-white/10 px-4 py-2 hover:bg-white/5"
        >
          Back to teams
        </Link>
      </div>

      {(saved || regenerated || error) && (
        <div className="space-y-1 rounded-xl border border-white/10 bg-black/30 p-4 text-sm">
          {saved && (
            <div className="text-emerald-300">Team details updated.</div>
          )}

          {regenerated && (
            <div className="text-emerald-300">
              New claim code generated (team unclaimed).
            </div>
          )}

          {error === "has_fixtures" && (
            <div className="text-red-300">
              Can’t delete this team because fixtures already exist for it.
            </div>
          )}
        </div>
      )}

      <div className="space-y-6 rounded-xl border border-white/10 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <TeamBadge name={team.name} logoUrl={team.logoUrl} size="lg" />

          <div className="space-y-1">
            <div>
              <div className="text-sm text-white/60">Team name</div>
              <div className="text-lg text-white">{team.name}</div>
            </div>

            <div className="text-sm text-white/60">
              {team.league
                ? `${team.league.name}${team.league.season ? ` — ${team.league.season}` : ""}`
                : "No league assigned"}
            </div>
          </div>
        </div>

        <form action={updateTeamDetailsAction} className="space-y-5">
          <input type="hidden" name="id" value={team.id} />

          <div className="space-y-2">
            <label htmlFor="leagueId" className="text-sm text-white/60">
              League
            </label>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <select
                id="leagueId"
                name="leagueId"
                defaultValue={team.leagueId ?? ""}
                className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-white"
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
            </div>

            <div className="text-xs text-white/50">
              Current:{" "}
              {team.league
                ? `${team.league.name}${team.league.season ? ` — ${team.league.season}` : ""}`
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
              className="w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-white placeholder:text-white/35"
            />

            <div className="text-xs text-white/50">
              Use a path from <span className="font-mono text-white/70">public/team-logos</span>,
              for example{" "}
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
            className="rounded-md bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-500"
          >
            Save team details
          </button>
        </form>

        <div>
          <div className="text-sm text-white/60">Captain status</div>

          {!hasManager && <div className="text-white/80">Unclaimed</div>}

          {hasManager && !claimedByCaptain && (
            <div className="text-yellow-200">Manager is admin</div>
          )}

          {claimedByCaptain && (
            <div className="text-emerald-200">
              Claimed • {managerUser?.email}
            </div>
          )}
        </div>

        <div>
          <div className="text-sm text-white/60">Claim code</div>
          <div className="flex items-center gap-3">
            <div className="font-mono text-sm text-white/80">{team.claimCode}</div>
            <CopyToClipboardButton
              text={team.claimCode}
              label="Copy code"
              className="rounded-md border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
            />
          </div>
        </div>

        <div>
          <div className="text-sm text-white/60">Claim link</div>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={claimLink}
              className="text-sm text-emerald-400 underline underline-offset-4 hover:text-emerald-300"
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

        <div>
          <div className="text-sm text-white/60">Team ID</div>
          <div className="font-mono text-sm text-white/80">{team.id}</div>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-6">
        <div className="font-semibold text-yellow-200">Captain code</div>
        <p className="text-sm text-white/60">
          Regenerating the claim code will invalidate the old link and{" "}
          <span className="text-white/80">unclaim the team</span> (removes current
          MANAGER assignment).
        </p>

        <form action={regenerateClaimCodeAction}>
          <input type="hidden" name="id" value={team.id} />
          <input
            type="hidden"
            name="from"
            value={`/admin/teams/${team.id}/edit`}
          />
          <ConfirmDeleteButton
            label="Regenerate claim code"
            confirmText={`Regenerate claim code for "${team.name}" and unclaim the team?`}
            className="rounded-md bg-yellow-600 px-4 py-2 text-black hover:bg-yellow-500"
          />
        </form>
      </div>

      <div className="space-y-4 rounded-xl border border-red-500/30 bg-red-500/5 p-6">
        <div className="font-semibold text-red-400">Danger Zone</div>

        <p className="text-sm text-white/60">
          Deleting a team cannot be undone.
        </p>

        <form action={deleteTeamAction}>
          <input type="hidden" name="id" value={team.id} />
          <input
            type="hidden"
            name="from"
            value={`/admin/teams/${team.id}/edit`}
          />
          <ConfirmDeleteButton
            label="Delete team"
            confirmText={`Delete "${team.name}"? This cannot be undone.`}
            className="rounded-md bg-red-600 px-4 py-2 text-white hover:bg-red-500"
          />
        </form>
      </div>
    </div>
  );
}