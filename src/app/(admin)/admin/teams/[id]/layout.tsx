// ========================================
// File: src/app/(admin)/admin/teams/[id]/layout.tsx
// ========================================

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import TeamDetailRouteLayout from "@/components/admin/teams/TeamDetailRouteLayout";
import TeamKitColourPicker from "@/components/admin/teams/TeamKitColourPicker";
import TeamOverviewOnly from "@/components/admin/teams/TeamOverviewOnly";
import TeamShinPadWarningPanel from "@/components/admin/teams/TeamShinPadWarningPanel";
import { getCurrentLeagueOptions } from "@/lib/current-leagues";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { markTeamAsFixturePlaceholder } from "@/lib/teams/fixture-placeholders";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TeamKickoffRuleRow = {
  id: string;
  name: string;
  leagueId: string | null;
  earliestKickoffTime: string | null;
  latestKickoffTime: string | null;
  isFixturePlaceholder: boolean;
  placeholderLeagueId: string | null;
  placeholderLeagueName: string | null;
  placeholderLeagueSeason: string | null;
};

type OccupiedPlaceholderLeagueRow = {
  leagueId: string;
};

function parseKickoffRestrictionTime(
  value: FormDataEntryValue | null,
  label: string,
) {
  const raw = String(value ?? "").trim();

  if (!raw) return null;

  if (!/^\d{2}:\d{2}$/.test(raw)) {
    throw new Error(`${label} must be in HH:MM format.`);
  }

  const [hours, minutes] = raw.split(":").map(Number);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error(`${label} is invalid.`);
  }

  return raw;
}

function parseTimeToMinutes(value: string | null) {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function getRestrictionSummary(team: TeamKickoffRuleRow) {
  if (team.earliestKickoffTime && team.latestKickoffTime) {
    return `Only schedule from ${team.earliestKickoffTime} to ${team.latestKickoffTime}.`;
  }

  if (team.earliestKickoffTime) {
    return `Do not schedule before ${team.earliestKickoffTime}.`;
  }

  if (team.latestKickoffTime) {
    return `Do not schedule after ${team.latestKickoffTime}.`;
  }

  return "No kick-off time restriction set.";
}

async function updateTeamKickoffRulesAction(formData: FormData) {
  "use server";

  await requireAdmin();

  const teamId = String(formData.get("teamId") ?? "").trim();

  if (!teamId) {
    redirect("/admin/teams?error=missing_id");
  }

  let earliestKickoffTime: string | null = null;
  let latestKickoffTime: string | null = null;

  try {
    earliestKickoffTime = parseKickoffRestrictionTime(
      formData.get("earliestKickoffTime"),
      "Earliest kick-off time",
    );
    latestKickoffTime = parseKickoffRestrictionTime(
      formData.get("latestKickoffTime"),
      "Latest kick-off time",
    );
  } catch {
    redirect(`/admin/teams/${teamId}?error=invalid_kickoff_time`);
  }

  const earliestMinutes = parseTimeToMinutes(earliestKickoffTime);
  const latestMinutes = parseTimeToMinutes(latestKickoffTime);

  if (
    earliestMinutes !== null &&
    latestMinutes !== null &&
    earliestMinutes > latestMinutes
  ) {
    redirect(`/admin/teams/${teamId}?error=invalid_kickoff_range`);
  }

  const updated = await prisma.$executeRaw`
    UPDATE "Team"
    SET
      "earliestKickoffTime" = ${earliestKickoffTime},
      "latestKickoffTime" = ${latestKickoffTime},
      "updatedAt" = NOW()
    WHERE "id" = ${teamId}
  `;

  if (updated === 0) {
    notFound();
  }

  revalidatePath("/admin/teams");
  revalidatePath(`/admin/teams/${teamId}`);
  revalidatePath(`/captain/team/${teamId}`);
  revalidatePath("/admin/fixtures");

  redirect(`/admin/teams/${teamId}?saved=1`);
}

async function convertTeamToFixturePlaceholderAction(formData: FormData) {
  "use server";

  await requireAdmin();

  const teamId = String(formData.get("teamId") ?? "").trim();
  const leagueId = String(formData.get("leagueId") ?? "").trim();

  if (!teamId) {
    redirect("/admin/teams?error=missing_id");
  }

  if (!leagueId) {
    redirect(`/admin/teams/${teamId}?error=placeholder_requires_league`);
  }

  const [team, league] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true },
    }),
    prisma.league.findUnique({
      where: { id: leagueId },
      select: { id: true, slug: true },
    }),
  ]);

  if (!team) {
    notFound();
  }

  if (!league) {
    redirect(`/admin/teams/${teamId}?error=placeholder_requires_league`);
  }

  try {
    await markTeamAsFixturePlaceholder({
      teamId,
      leagueId,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "This league already has a fixture placeholder team."
    ) {
      redirect(`/admin/teams/${teamId}?error=placeholder_exists`);
    }

    throw error;
  }

  revalidatePath("/admin/teams");
  revalidatePath(`/admin/teams/${teamId}`);
  revalidatePath(`/admin/leagues/${leagueId}`);
  revalidatePath(`/leagues/${league.slug}`);
  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/fixtures/generate");
  revalidatePath("/admin/night-board");

  redirect(`/admin/teams/${teamId}?saved=1`);
}

export default async function AdminTeamDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  const [rows, leagues, occupiedPlaceholderRows] = await Promise.all([
    prisma.$queryRaw<TeamKickoffRuleRow[]>`
      SELECT
        t."id",
        t."name",
        t."leagueId",
        t."earliestKickoffTime",
        t."latestKickoffTime",
        COALESCE(t."isFixturePlaceholder", false) AS "isFixturePlaceholder",
        placeholder_membership."leagueId" AS "placeholderLeagueId",
        placeholder_membership."leagueName" AS "placeholderLeagueName",
        placeholder_membership."leagueSeason" AS "placeholderLeagueSeason"
      FROM "Team" t
      LEFT JOIN LATERAL (
        SELECT
          lst."leagueId",
          l."name" AS "leagueName",
          l."season" AS "leagueSeason"
        FROM "LeagueSeasonTeam" lst
        JOIN "League" l ON l."id" = lst."leagueId"
        WHERE lst."teamId" = t."id"
          AND lst."isActive" = true
        ORDER BY lst."updatedAt" DESC
        LIMIT 1
      ) placeholder_membership ON true
      WHERE t."id" = ${id}
      LIMIT 1
    `,
    getCurrentLeagueOptions(),
    prisma.$queryRaw<OccupiedPlaceholderLeagueRow[]>`
      SELECT DISTINCT lst."leagueId"
      FROM "LeagueSeasonTeam" lst
      JOIN "Team" t ON t."id" = lst."teamId"
      WHERE lst."isActive" = true
        AND t."isFixturePlaceholder" = true
    `,
  ]);
  const team = rows[0] ?? null;

  if (!team) {
    notFound();
  }

  const occupiedLeagueIds = new Set(
    occupiedPlaceholderRows.map((row) => row.leagueId),
  );
  const availablePlaceholderLeagues = leagues.filter(
    (league) => !occupiedLeagueIds.has(league.id),
  );
  const placeholderLeagueLabel = team.placeholderLeagueName
    ? `${team.placeholderLeagueName}${
        team.placeholderLeagueSeason ? ` — ${team.placeholderLeagueSeason}` : ""
      }`
    : "League season not found";

  return (
    <div data-team-detail-shell className="space-y-5">
      <TeamDetailRouteLayout teamId={team.id} />

      <section className="rounded-3xl border border-emerald-400/15 bg-emerald-500/[0.06] px-4 py-3 shadow-[0_14px_50px_rgba(0,0,0,0.25)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
              Admin preview tools
            </p>
            <p className="mt-1 text-sm text-white/60">
              Open the admin version, true captain-only preview, player view and
              managed squad tools for this team.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/admin/teams/${id}`}
              className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/5 hover:text-white"
            >
              Team overview
            </Link>
            <Link
              href={`/admin/teams/${id}/badge`}
              className="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
            >
              Upload badge
            </Link>
            <Link
              href={`/admin/teams/${id}/managed-squad`}
              className="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
            >
              Managed squad
            </Link>
            <Link
              href={`/admin/teams/${id}/captain-admin-view`}
              className="inline-flex items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-100 transition hover:bg-amber-500/15"
            >
              Admin captain view
            </Link>
            <Link
              href={`/admin/teams/${id}/captain-preview`}
              className="inline-flex items-center justify-center rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-2.5 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/15"
            >
              Captain-only preview
            </Link>
            <Link
              href={`/admin/teams/${id}/player-preview`}
              className="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
            >
              Player view
            </Link>
            <Link
              href={`/admin/teams/${id}/prospects`}
              className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/75 transition hover:bg-white/10 hover:text-white"
            >
              Prospects
            </Link>
            <Link
              href={`/admin/messages?composeTeam=${encodeURIComponent(id)}`}
              className="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
            >
              Squad comms
            </Link>
          </div>
        </div>
      </section>

      <TeamOverviewOnly teamId={team.id}>
        <TeamShinPadWarningPanel teamId={team.id} />

        <TeamKitColourPicker teamId={team.id} />

        <section className="rounded-3xl border border-amber-400/20 bg-amber-500/10 px-4 py-4 shadow-[0_14px_50px_rgba(0,0,0,0.22)]">
          {team.isFixturePlaceholder ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/75">
                  Fixture placeholder
                </p>
                <h2 className="mt-1 text-lg font-semibold text-white">
                  This team is the TBC fixture placeholder
                </h2>
                <p className="mt-1 text-sm leading-6 text-amber-50/70">
                  Assigned to {placeholderLeagueLabel}. It remains available in
                  Admin fixture selectors but is excluded from public tables,
                  normal team counts, payments, confirmations and predictions.
                </p>
              </div>
              <span className="inline-flex w-fit rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-amber-100">
                Placeholder active
              </span>
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(420px,640px)] xl:items-end">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/75">
                  Fixture placeholder
                </p>
                <h2 className="mt-1 text-lg font-semibold text-white">
                  Convert this existing team into TBC
                </h2>
                <p className="mt-1 text-sm leading-6 text-amber-50/70">
                  Use this only for a placeholder team. Conversion clears normal
                  team contacts, recruitment settings and kick-off restrictions,
                  and the team will no longer appear in public tables or counts.
                  Only leagues without an existing placeholder are listed.
                </p>
              </div>

              {availablePlaceholderLeagues.length > 0 ? (
                <form
                  action={convertTeamToFixturePlaceholderAction}
                  className="grid w-full gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <input type="hidden" name="teamId" value={team.id} />
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                      Placeholder league
                    </span>
                    <select
                      name="leagueId"
                      required
                      defaultValue={
                        availablePlaceholderLeagues.some(
                          (league) => league.id === team.leagueId,
                        )
                          ? team.leagueId ?? ""
                          : ""
                      }
                      className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-amber-300/50"
                    >
                      <option value="">Select league season</option>
                      {availablePlaceholderLeagues.map((league) => (
                        <option key={league.id} value={league.id}>
                          {league.name}
                          {league.season ? ` — ${league.season}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-amber-300 px-4 text-sm font-semibold text-black transition hover:bg-amber-200 sm:self-end"
                  >
                    Convert to TBC placeholder
                  </button>
                </form>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/60">
                  Every current league already has a fixture placeholder.
                </div>
              )}
            </div>
          )}
        </section>

        {!team.isFixturePlaceholder ? (
          <section className="rounded-3xl border border-amber-400/20 bg-amber-500/10 px-4 py-4 shadow-[0_14px_50px_rgba(0,0,0,0.22)]">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(420px,640px)] xl:items-end">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/75">
                  Kick-off rules
                </p>
                <h2 className="mt-1 text-lg font-semibold text-white">
                  Earliest and latest kick-off times
                </h2>
                <p className="mt-1 text-sm leading-6 text-amber-50/70">
                  {getRestrictionSummary(team)} Fixture creation and generation will
                  block matches outside this window.
                </p>
              </div>

              <form
                action={updateTeamKickoffRulesAction}
                className="grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
              >
                <input type="hidden" name="teamId" value={team.id} />
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                    Earliest kick-off
                  </span>
                  <input
                    name="earliestKickoffTime"
                    type="time"
                    defaultValue={team.earliestKickoffTime ?? ""}
                    className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-emerald-400/50"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                    Latest kick-off
                  </span>
                  <input
                    name="latestKickoffTime"
                    type="time"
                    defaultValue={team.latestKickoffTime ?? ""}
                    className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-emerald-400/50"
                  />
                </label>
                <button
                  type="submit"
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-black transition hover:bg-emerald-300 sm:col-span-2 xl:col-span-1 xl:self-end"
                >
                  Save rules
                </button>
              </form>
            </div>
          </section>
        ) : null}
      </TeamOverviewOnly>

      {children}
    </div>
  );
}
