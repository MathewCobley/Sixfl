import Link from "next/link";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  approveTeamRegistrationReviewAction,
  blockTeamRegistrationAction,
  clearPlayerSuspensionAction,
  clearTeamManagementRestrictionAction,
  clearTeamRegistrationBlockAction,
  restrictTeamManagementAction,
  suspendPlayerAction,
} from "./actions";

type TeamControlRow = {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  registrationBlocked: boolean;
  registrationBlockedAt: Date | null;
  registrationBlockedReason: string | null;
  registrationReviewRequired: boolean;
  registrationReviewReason: string | null;
  registrationReviewSourceTeamId: string | null;
  registrationReviewApprovedAt: Date | null;
  sourceTeamName: string | null;
  captainUserId: string | null;
  captainName: string | null;
  captainEmail: string | null;
  memberCount: number;
};

type UserControlRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  teamManagementRestricted: boolean;
  teamManagementRestrictedAt: Date | null;
  teamManagementRestrictionReason: string | null;
  playingRestricted: boolean;
  playingRestrictedAt: Date | null;
  playingRestrictedUntil: Date | null;
  playingRestrictionReason: string | null;
  teams: string | null;
};

type AuditRow = {
  id: string;
  subjectType: string;
  subjectId: string;
  action: string;
  reason: string | null;
  until: Date | null;
  createdAt: Date;
  subjectName: string | null;
};

function fmt(value: Date | null) {
  if (!value) return "—";
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function messageFor(saved?: string, error?: string) {
  if (error === "team_reason_required") return "Add a reason before blocking the team.";
  if (error === "user_reason_required") return "Add a reason before restricting this person.";
  if (error === "team_not_found") return "Team not found.";
  if (error === "user_not_found") return "User not found.";
  if (error === "admin_protected") return "Admin accounts cannot be restricted from this screen.";
  if (saved === "team_blocked") return "Team registration blocked.";
  if (saved === "team_cleared") return "Team registration block cleared.";
  if (saved === "review_approved") return "Team review approved.";
  if (saved === "management_restricted") return "Team-management restriction applied.";
  if (saved === "management_cleared") return "Team-management restriction cleared.";
  if (saved === "player_suspended") return "Player suspension applied.";
  if (saved === "player_cleared") return "Player suspension cleared.";
  return null;
}

export default async function ParticipationControlsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; saved?: string; error?: string }>;
}) {
  await requireAdmin();
  const sp = (await searchParams) ?? {};
  const q = (sp.q ?? "").trim();
  const like = `%${q}%`;

  const [activeTeams, activeUsers, audit, teamSearch, userSearch] = await Promise.all([
    prisma.$queryRawUnsafe<TeamControlRow[]>(`
      SELECT
        team."id",
        team."name",
        team."contactName",
        team."contactEmail",
        team."contactPhone",
        COALESCE(team."registrationBlocked", false) AS "registrationBlocked",
        team."registrationBlockedAt",
        team."registrationBlockedReason",
        COALESCE(team."registrationReviewRequired", false) AS "registrationReviewRequired",
        team."registrationReviewReason",
        team."registrationReviewSourceTeamId",
        team."registrationReviewApprovedAt",
        source_team."name" AS "sourceTeamName",
        COALESCE(
          team."captainUserId",
          (
            SELECT member."userId"
            FROM "TeamMember" member
            WHERE member."teamId" = team."id"
              AND member."role"::text = 'CAPTAIN'
            ORDER BY member."createdAt" ASC
            LIMIT 1
          )
        ) AS "captainUserId",
        captain_user."name" AS "captainName",
        captain_user."email" AS "captainEmail",
        (SELECT COUNT(*)::int FROM "TeamMember" member_count WHERE member_count."teamId" = team."id") AS "memberCount"
      FROM "Team" team
      LEFT JOIN "Team" source_team ON source_team."id" = team."registrationReviewSourceTeamId"
      LEFT JOIN "User" captain_user ON captain_user."id" = COALESCE(
        team."captainUserId",
        (
          SELECT member."userId"
          FROM "TeamMember" member
          WHERE member."teamId" = team."id"
            AND member."role"::text = 'CAPTAIN'
          ORDER BY member."createdAt" ASC
          LIMIT 1
        )
      )
      WHERE COALESCE(team."registrationBlocked", false) = true
         OR COALESCE(team."registrationReviewRequired", false) = true
      ORDER BY team."registrationReviewRequired" DESC, team."registrationBlockedAt" DESC NULLS LAST, team."name" ASC
    `),
    prisma.$queryRawUnsafe<UserControlRow[]>(`
      SELECT
        player_user."id",
        player_user."name",
        player_user."email",
        player_user."role"::text AS "role",
        COALESCE(player_user."teamManagementRestricted", false) AS "teamManagementRestricted",
        player_user."teamManagementRestrictedAt",
        player_user."teamManagementRestrictionReason",
        COALESCE(player_user."playingRestricted", false) AS "playingRestricted",
        player_user."playingRestrictedAt",
        player_user."playingRestrictedUntil",
        player_user."playingRestrictionReason",
        STRING_AGG(DISTINCT team."name", ', ' ORDER BY team."name") AS "teams"
      FROM "User" player_user
      LEFT JOIN "TeamMember" member ON member."userId" = player_user."id"
      LEFT JOIN "Team" team ON team."id" = member."teamId"
      WHERE COALESCE(player_user."teamManagementRestricted", false) = true
         OR (
           COALESCE(player_user."playingRestricted", false) = true
           AND (player_user."playingRestrictedUntil" IS NULL OR player_user."playingRestrictedUntil" > NOW())
         )
      GROUP BY player_user."id"
      ORDER BY player_user."name" ASC NULLS LAST, player_user."email" ASC NULLS LAST
    `),
    prisma.$queryRawUnsafe<AuditRow[]>(`
      SELECT
        audit."id",
        audit."subjectType",
        audit."subjectId",
        audit."action",
        audit."reason",
        audit."until",
        audit."createdAt",
        CASE
          WHEN audit."subjectType" = 'TEAM' THEN (SELECT team."name" FROM "Team" team WHERE team."id" = audit."subjectId")
          WHEN audit."subjectType" = 'USER' THEN (SELECT COALESCE(player_user."name", player_user."email") FROM "User" player_user WHERE player_user."id" = audit."subjectId")
          ELSE NULL
        END AS "subjectName"
      FROM "ParticipationRestrictionAudit" audit
      ORDER BY audit."createdAt" DESC
      LIMIT 100
    `),
    q.length >= 2
      ? prisma.$queryRawUnsafe<TeamControlRow[]>(
          `
            SELECT
              team."id",
              team."name",
              team."contactName",
              team."contactEmail",
              team."contactPhone",
              COALESCE(team."registrationBlocked", false) AS "registrationBlocked",
              team."registrationBlockedAt",
              team."registrationBlockedReason",
              COALESCE(team."registrationReviewRequired", false) AS "registrationReviewRequired",
              team."registrationReviewReason",
              team."registrationReviewSourceTeamId",
              team."registrationReviewApprovedAt",
              source_team."name" AS "sourceTeamName",
              COALESCE(team."captainUserId", captain_member."userId") AS "captainUserId",
              captain_user."name" AS "captainName",
              captain_user."email" AS "captainEmail",
              (SELECT COUNT(*)::int FROM "TeamMember" member_count WHERE member_count."teamId" = team."id") AS "memberCount"
            FROM "Team" team
            LEFT JOIN "Team" source_team ON source_team."id" = team."registrationReviewSourceTeamId"
            LEFT JOIN LATERAL (
              SELECT member."userId"
              FROM "TeamMember" member
              WHERE member."teamId" = team."id"
                AND member."role"::text = 'CAPTAIN'
              ORDER BY member."createdAt" ASC
              LIMIT 1
            ) captain_member ON true
            LEFT JOIN "User" captain_user ON captain_user."id" = COALESCE(team."captainUserId", captain_member."userId")
            WHERE team."name" ILIKE $1
               OR COALESCE(team."contactName", '') ILIKE $1
               OR COALESCE(team."contactEmail", '') ILIKE $1
               OR COALESCE(team."contactPhone", '') ILIKE $1
            ORDER BY team."name" ASC
            LIMIT 30
          `,
          like,
        )
      : Promise.resolve([] as TeamControlRow[]),
    q.length >= 2
      ? prisma.$queryRawUnsafe<UserControlRow[]>(
          `
            SELECT
              player_user."id",
              player_user."name",
              player_user."email",
              player_user."role"::text AS "role",
              COALESCE(player_user."teamManagementRestricted", false) AS "teamManagementRestricted",
              player_user."teamManagementRestrictedAt",
              player_user."teamManagementRestrictionReason",
              COALESCE(player_user."playingRestricted", false) AS "playingRestricted",
              player_user."playingRestrictedAt",
              player_user."playingRestrictedUntil",
              player_user."playingRestrictionReason",
              STRING_AGG(DISTINCT team."name", ', ' ORDER BY team."name") AS "teams"
            FROM "User" player_user
            LEFT JOIN "TeamMember" member ON member."userId" = player_user."id"
            LEFT JOIN "Team" team ON team."id" = member."teamId"
            WHERE COALESCE(player_user."name", '') ILIKE $1
               OR COALESCE(player_user."email", '') ILIKE $1
            GROUP BY player_user."id"
            ORDER BY player_user."name" ASC NULLS LAST, player_user."email" ASC NULLS LAST
            LIMIT 40
          `,
          like,
        )
      : Promise.resolve([] as UserControlRow[]),
  ]);

  const notice = messageFor(sp.saved, sp.error);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-2">
        <Link href="/admin" className="text-sm text-emerald-300 hover:text-emerald-200">
          ← Back to admin
        </Link>
        <h1 className="text-3xl font-semibold text-white">Participation controls</h1>
        <p className="max-w-4xl text-sm leading-6 text-white/60">
          Block removed teams from simply returning under another name, restrict a captain or organiser from creating or managing teams, and suspend an individual player without automatically penalising the rest of their squad.
        </p>
      </div>

      {notice ? (
        <div className={`rounded-2xl border p-4 text-sm ${sp.error ? "border-red-400/25 bg-red-500/10 text-red-100" : "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"}`}>
          {notice}
        </div>
      ) : null}

      <section className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.06] p-5">
        <h2 className="text-lg font-semibold text-amber-100">How the safeguard works</h2>
        <p className="mt-2 text-sm leading-6 text-white/65">
          Blocking a team does not automatically ban every player. A captain can be restricted separately, and individual players can be suspended separately. If a new team reuses blocked-team contact details, or reaches four shared registered players with a blocked team, it is automatically held for admin review. Admin can approve a legitimate re-formation.
        </p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/30 p-5">
        <h2 className="text-lg font-semibold text-white">Find a team or person</h2>
        <form className="mt-4 flex flex-col gap-3 sm:flex-row" action="/admin/participation-controls" method="get">
          <input
            name="q"
            defaultValue={q}
            placeholder="Team name, captain, email or phone"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-white outline-none placeholder:text-white/30 focus:border-emerald-400/50"
          />
          <button className="rounded-xl bg-emerald-500 px-4 py-2.5 font-medium text-black hover:bg-emerald-400">
            Search
          </button>
        </form>
      </section>

      {q.length >= 2 ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="space-y-3 rounded-2xl border border-white/10 bg-black/30 p-5">
            <h2 className="text-lg font-semibold text-white">Team results</h2>
            {teamSearch.length === 0 ? <p className="text-sm text-white/50">No matching teams.</p> : null}
            {teamSearch.map((team) => (
              <div key={team.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link href={`/admin/teams/${team.id}`} className="font-semibold text-white hover:text-emerald-200">{team.name}</Link>
                    <div className="mt-1 text-xs text-white/50">
                      Captain: {team.captainName || team.contactName || "—"} · {team.captainEmail || team.contactEmail || "no email"} · {team.memberCount} registered
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {team.registrationBlocked ? <span className="rounded-full bg-red-500/15 px-2 py-1 text-red-200">Blocked</span> : null}
                    {team.registrationReviewRequired ? <span className="rounded-full bg-amber-500/15 px-2 py-1 text-amber-200">Review required</span> : null}
                  </div>
                </div>

                {!team.registrationBlocked ? (
                  <form action={blockTeamRegistrationAction} className="mt-4 space-y-3">
                    <input type="hidden" name="teamId" value={team.id} />
                    <textarea name="reason" required placeholder="Reason for blocking this team" className="min-h-20 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white outline-none placeholder:text-white/30" />
                    <label className="flex items-center gap-2 text-sm text-white/70">
                      <input type="checkbox" name="restrictCaptain" defaultChecked className="h-4 w-4" />
                      Also restrict the current captain/organiser from creating or managing another team
                    </label>
                    <button className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-100 hover:bg-red-500/15">Block team registration</button>
                  </form>
                ) : (
                  <form action={clearTeamRegistrationBlockAction} className="mt-4 flex flex-wrap gap-2">
                    <input type="hidden" name="teamId" value={team.id} />
                    <button className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white hover:bg-white/10">Clear team block</button>
                  </form>
                )}

                {team.registrationReviewRequired ? (
                  <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-3 text-sm text-amber-50">
                    <div>{team.registrationReviewReason}</div>
                    {team.sourceTeamName ? <div className="mt-1 text-xs text-amber-100/60">Matched blocked team: {team.sourceTeamName}</div> : null}
                    <form action={approveTeamRegistrationReviewAction} className="mt-3">
                      <input type="hidden" name="teamId" value={team.id} />
                      <button className="rounded-xl bg-amber-300 px-3 py-2 text-sm font-medium text-black hover:bg-amber-200">Approve this re-formation</button>
                    </form>
                  </div>
                ) : null}
              </div>
            ))}
          </section>

          <section className="space-y-3 rounded-2xl border border-white/10 bg-black/30 p-5">
            <h2 className="text-lg font-semibold text-white">People results</h2>
            {userSearch.length === 0 ? <p className="text-sm text-white/50">No matching people.</p> : null}
            {userSearch.map((user) => {
              const activePlayingRestriction = user.playingRestricted && (!user.playingRestrictedUntil || user.playingRestrictedUntil.getTime() > Date.now());
              return (
                <div key={user.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="font-semibold text-white">{user.name || user.email || "Unnamed account"}</div>
                  <div className="mt-1 text-xs text-white/50">{user.email || "No email"}{user.teams ? ` · ${user.teams}` : ""}</div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {user.teamManagementRestricted ? <span className="rounded-full bg-red-500/15 px-2 py-1 text-red-200">Cannot manage teams</span> : null}
                    {activePlayingRestriction ? <span className="rounded-full bg-amber-500/15 px-2 py-1 text-amber-200">Player suspended</span> : null}
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {user.teamManagementRestricted ? (
                      <form action={clearTeamManagementRestrictionAction}>
                        <input type="hidden" name="userId" value={user.id} />
                        <button className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white hover:bg-white/10">Allow team management</button>
                      </form>
                    ) : (
                      <form action={restrictTeamManagementAction} className="space-y-2">
                        <input type="hidden" name="userId" value={user.id} />
                        <textarea name="reason" required placeholder="Why can’t this person manage a team?" className="min-h-20 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white outline-none placeholder:text-white/30" />
                        <button className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100 hover:bg-red-500/15">Restrict team management</button>
                      </form>
                    )}

                    {activePlayingRestriction ? (
                      <form action={clearPlayerSuspensionAction}>
                        <input type="hidden" name="userId" value={user.id} />
                        <button className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white hover:bg-white/10">Clear player suspension</button>
                      </form>
                    ) : (
                      <form action={suspendPlayerAction} className="space-y-2">
                        <input type="hidden" name="userId" value={user.id} />
                        <textarea name="reason" required placeholder="Reason for player suspension" className="min-h-20 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white outline-none placeholder:text-white/30" />
                        <label className="block text-xs text-white/55">End date (leave blank for indefinite)</label>
                        <input type="date" name="until" className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white" />
                        <button className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100 hover:bg-amber-500/15">Suspend player</button>
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-3 rounded-2xl border border-white/10 bg-black/30 p-5">
          <h2 className="text-lg font-semibold text-white">Teams blocked or awaiting review</h2>
          {activeTeams.length === 0 ? <p className="text-sm text-white/50">No active team blocks or reviews.</p> : null}
          {activeTeams.map((team) => (
            <div key={team.id} className="rounded-xl border border-white/10 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/admin/teams/${team.id}`} className="font-semibold text-white hover:text-emerald-200">{team.name}</Link>
                  <div className="mt-1 text-xs text-white/45">{team.memberCount} registered players · captain {team.captainName || team.contactName || "—"}</div>
                </div>
                <div className="flex gap-2 text-xs">
                  {team.registrationBlocked ? <span className="rounded-full bg-red-500/15 px-2 py-1 text-red-200">Blocked</span> : null}
                  {team.registrationReviewRequired ? <span className="rounded-full bg-amber-500/15 px-2 py-1 text-amber-200">Review</span> : null}
                </div>
              </div>
              {team.registrationBlockedReason ? <p className="mt-3 text-sm text-white/65">{team.registrationBlockedReason}</p> : null}
              {team.registrationReviewReason ? <p className="mt-3 text-sm text-amber-100/80">{team.registrationReviewReason}</p> : null}
              {team.registrationBlockedAt ? <div className="mt-2 text-xs text-white/40">Blocked {fmt(team.registrationBlockedAt)}</div> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {team.registrationBlocked ? (
                  <form action={clearTeamRegistrationBlockAction}>
                    <input type="hidden" name="teamId" value={team.id} />
                    <button className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white hover:bg-white/10">Clear block</button>
                  </form>
                ) : null}
                {team.registrationReviewRequired ? (
                  <form action={approveTeamRegistrationReviewAction}>
                    <input type="hidden" name="teamId" value={team.id} />
                    <button className="rounded-xl bg-amber-300 px-3 py-2 text-sm font-medium text-black hover:bg-amber-200">Approve review</button>
                  </form>
                ) : null}
              </div>
            </div>
          ))}
        </section>

        <section className="space-y-3 rounded-2xl border border-white/10 bg-black/30 p-5">
          <h2 className="text-lg font-semibold text-white">Restricted people</h2>
          {activeUsers.length === 0 ? <p className="text-sm text-white/50">No active individual restrictions.</p> : null}
          {activeUsers.map((user) => (
            <div key={user.id} className="rounded-xl border border-white/10 p-4">
              <div className="font-semibold text-white">{user.name || user.email || "Unnamed account"}</div>
              <div className="mt-1 text-xs text-white/45">{user.email || "No email"}{user.teams ? ` · ${user.teams}` : ""}</div>
              {user.teamManagementRestricted ? (
                <div className="mt-3 rounded-xl bg-red-500/[0.08] p-3 text-sm text-red-100">
                  <div className="font-medium">Cannot create/manage teams</div>
                  <div className="mt-1 text-red-100/70">{user.teamManagementRestrictionReason || "No reason recorded"}</div>
                  <form action={clearTeamManagementRestrictionAction} className="mt-2">
                    <input type="hidden" name="userId" value={user.id} />
                    <button className="rounded-lg border border-red-200/20 px-2.5 py-1.5 text-xs hover:bg-white/5">Clear management restriction</button>
                  </form>
                </div>
              ) : null}
              {user.playingRestricted && (!user.playingRestrictedUntil || user.playingRestrictedUntil.getTime() > Date.now()) ? (
                <div className="mt-3 rounded-xl bg-amber-500/[0.08] p-3 text-sm text-amber-100">
                  <div className="font-medium">Player suspended {user.playingRestrictedUntil ? `until ${fmt(user.playingRestrictedUntil)}` : "indefinitely"}</div>
                  <div className="mt-1 text-amber-100/70">{user.playingRestrictionReason || "No reason recorded"}</div>
                  <form action={clearPlayerSuspensionAction} className="mt-2">
                    <input type="hidden" name="userId" value={user.id} />
                    <button className="rounded-lg border border-amber-200/20 px-2.5 py-1.5 text-xs hover:bg-white/5">Clear player suspension</button>
                  </form>
                </div>
              ) : null}
            </div>
          ))}
        </section>
      </div>

      <section className="rounded-2xl border border-white/10 bg-black/30 p-5">
        <h2 className="text-lg font-semibold text-white">Restriction audit trail</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-white/40">
              <tr>
                <th className="pb-3 pr-4">When</th>
                <th className="pb-3 pr-4">Subject</th>
                <th className="pb-3 pr-4">Action</th>
                <th className="pb-3 pr-4">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/8">
              {audit.map((row) => (
                <tr key={row.id}>
                  <td className="py-3 pr-4 text-white/50">{fmt(row.createdAt)}</td>
                  <td className="py-3 pr-4 text-white">{row.subjectName || row.subjectId}</td>
                  <td className="py-3 pr-4 text-white/70">{row.action.replaceAll("_", " ")}</td>
                  <td className="py-3 pr-4 text-white/60">{row.reason || "—"}{row.until ? ` · until ${fmt(row.until)}` : ""}</td>
                </tr>
              ))}
              {audit.length === 0 ? (
                <tr><td colSpan={4} className="py-4 text-white/40">No restriction actions recorded yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
