// ========================================
// File: src/app/admin/teams/page.tsx
// ========================================

import Link from "next/link";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { deleteTeamAction } from "./actions";
import ConfirmDeleteButton from "@/components/admin/ConfirmDeleteButton";
import CopyToClipboardButton from "@/components/admin/CopyToClipboardButton";
import TeamBadge from "@/components/admin/TeamBadge";

export default async function AdminTeamsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    deleted?: string;
    error?: string;
    regenerated?: string;
  }>;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};
  const deleted = sp.deleted === "1";
  const regenerated = sp.regenerated === "1";
  const error = sp.error;

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
    include: {
      league: {
        select: {
          id: true,
          name: true,
          season: true,
        },
      },
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
    },
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Teams</h1>

        <Link
          href="/admin/teams/new"
          className="rounded-md bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-500"
        >
          Add team
        </Link>
      </div>

      {(deleted || regenerated || error) && (
        <div className="space-y-1 rounded-xl border border-white/10 bg-black/30 p-4 text-sm">
          {deleted && <div className="text-emerald-300">Team deleted.</div>}
          {regenerated && (
            <div className="text-emerald-300">Claim code regenerated.</div>
          )}

          {error === "missing_id" && (
            <div className="text-red-300">Action failed (missing id).</div>
          )}
          {error === "has_fixtures" && (
            <div className="text-red-300">
              Can’t delete this team because fixtures already exist for it.
            </div>
          )}
        </div>
      )}

      <div className="divide-y divide-white/10 rounded-xl border border-white/10">
        {teams.map((team) => {
          const managerUser = team.members[0]?.user;
          const hasManager = Boolean(managerUser?.email);

          const claimedByCaptain =
            hasManager && managerUser?.role !== UserRole.ADMIN;

          const claimLink = `${baseUrl}/claim?code=${encodeURIComponent(
            team.claimCode
          )}`;

          return (
            <div
              key={team.id}
              className="flex items-center justify-between gap-4 p-4"
            >
              <div className="flex min-w-0 items-center gap-4">
                <TeamBadge
                  name={team.name}
                  logoUrl={team.logoUrl}
                  size="sm"
                />

                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="font-medium text-white">{team.name}</div>

                    {team.league ? (
                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200">
                        {team.league.name}
                        {team.league.season ? ` • ${team.league.season}` : ""}
                      </span>
                    ) : (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/60">
                        No league
                      </span>
                    )}

                    {!hasManager && (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/70">
                        Unclaimed
                      </span>
                    )}

                    {hasManager && !claimedByCaptain && (
                      <span className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-1 text-xs text-yellow-200">
                        Manager is admin
                      </span>
                    )}

                    {claimedByCaptain && (
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200">
                        Claimed
                        {managerUser?.email ? ` • ${managerUser.email}` : ""}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
                    <span className="font-mono">{team.claimCode}</span>
                    <CopyToClipboardButton
                      text={claimLink}
                      label="Copy claim link"
                      className="rounded-md border border-white/10 px-3 py-1.5 text-white/80 hover:bg-white/5"
                    />
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-4">
                <Link
                  href={`/admin/teams/${team.id}/edit`}
                  className="text-sm text-emerald-400 hover:text-emerald-300"
                >
                  Edit
                </Link>

                <form action={deleteTeamAction}>
                  <input type="hidden" name="id" value={team.id} />
                  <input type="hidden" name="from" value="/admin/teams" />
                  <ConfirmDeleteButton
                    label="Delete"
                    confirmText={`Delete "${team.name}"? This cannot be undone.`}
                    className="text-sm text-red-400 hover:text-red-300"
                  />
                </form>
              </div>
            </div>
          );
        })}

        {teams.length === 0 && (
          <div className="p-4 text-white/60">No teams created yet</div>
        )}
      </div>
    </div>
  );
}