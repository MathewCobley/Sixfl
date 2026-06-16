// ========================================
// File: src/app/(admin)/admin/teams/[id]/kickoff-preferences/page.tsx
// ========================================

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TeamKickoffPreferenceRow = {
  id: string;
  name: string;
  leagueId: string | null;
  earliestKickoffTime: string | null;
  latestKickoffTime: string | null;
  leagueName: string | null;
  leagueSeason: string | null;
};

function parseKickoffRestrictionTime(value: FormDataEntryValue | null, label: string) {
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

function buildRedirect(teamId: string, params: Record<string, string>) {
  const searchParams = new URLSearchParams(params);
  return `/admin/teams/${teamId}/kickoff-preferences?${searchParams.toString()}`;
}

async function updateTeamKickoffPreferencesAction(formData: FormData) {
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
    redirect(buildRedirect(teamId, { error: "invalid_time" }));
  }

  const earliestMinutes = parseTimeToMinutes(earliestKickoffTime);
  const latestMinutes = parseTimeToMinutes(latestKickoffTime);

  if (
    earliestMinutes !== null &&
    latestMinutes !== null &&
    earliestMinutes > latestMinutes
  ) {
    redirect(buildRedirect(teamId, { error: "invalid_range" }));
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
  revalidatePath(`/admin/teams/${teamId}/kickoff-preferences`);
  revalidatePath("/admin/fixtures");

  redirect(buildRedirect(teamId, { saved: "1" }));
}

function getRestrictionSummary(team: TeamKickoffPreferenceRow) {
  if (team.earliestKickoffTime && team.latestKickoffTime) {
    return `This team can only be scheduled from ${team.earliestKickoffTime} to ${team.latestKickoffTime}.`;
  }

  if (team.earliestKickoffTime) {
    return `This team cannot be scheduled before ${team.earliestKickoffTime}.`;
  }

  if (team.latestKickoffTime) {
    return `This team cannot be scheduled after ${team.latestKickoffTime}.`;
  }

  return "No kick-off time restriction is set for this team.";
}

export default async function AdminTeamKickoffPreferencesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ saved?: string; error?: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  const sp = (await searchParams) ?? {};

  const rows = await prisma.$queryRaw<TeamKickoffPreferenceRow[]>`
    SELECT
      t."id",
      t."name",
      t."leagueId",
      t."earliestKickoffTime",
      t."latestKickoffTime",
      l."name" AS "leagueName",
      l."season" AS "leagueSeason"
    FROM "Team" t
    LEFT JOIN "League" l ON l."id" = t."leagueId"
    WHERE t."id" = ${id}
    LIMIT 1
  `;

  const team = rows[0] ?? null;

  if (!team) {
    notFound();
  }

  const leagueLabel = team.leagueName
    ? `${team.leagueName}${team.leagueSeason ? ` • ${team.leagueSeason}` : ""}`
    : "No league assigned";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/80">
            Team scheduling rules
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
            Kick-off preferences
          </h1>
          <p className="mt-2 text-sm leading-6 text-white/60">
            Set the earliest and latest kick-off times this team can accept.
            Fixture creation and fixture generation will block matches outside
            this window.
          </p>
        </div>

        <Link
          href={`/admin/teams/${team.id}`}
          className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          Back to team
        </Link>
      </div>

      {(sp.saved === "1" || sp.error) ? (
        <div className="space-y-2 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm">
          {sp.saved === "1" ? (
            <div className="text-emerald-300">Kick-off preferences saved.</div>
          ) : null}

          {sp.error === "invalid_time" ? (
            <div className="text-red-300">
              Please use a valid HH:MM time for kick-off restrictions.
            </div>
          ) : null}

          {sp.error === "invalid_range" ? (
            <div className="text-red-300">
              Earliest kick-off time cannot be later than latest kick-off time.
            </div>
          ) : null}
        </div>
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.3)] sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">{team.name}</h2>
            <p className="mt-1 text-sm text-white/50">{leagueLabel}</p>
          </div>
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {getRestrictionSummary(team)}
          </div>
        </div>

        <form action={updateTeamKickoffPreferencesAction} className="mt-8 space-y-6">
          <input type="hidden" name="teamId" value={team.id} />

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <label
                htmlFor="earliestKickoffTime"
                className="text-sm font-medium text-white/70"
              >
                Earliest kick-off time
              </label>
              <input
                id="earliestKickoffTime"
                name="earliestKickoffTime"
                type="time"
                defaultValue={team.earliestKickoffTime ?? ""}
                className="h-12 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/15"
              />
              <p className="text-xs leading-5 text-white/45">
                Example: set 19:40 if the team cannot make a 19:00 kick-off.
              </p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="latestKickoffTime"
                className="text-sm font-medium text-white/70"
              >
                Latest kick-off time
              </label>
              <input
                id="latestKickoffTime"
                name="latestKickoffTime"
                type="time"
                defaultValue={team.latestKickoffTime ?? ""}
                className="h-12 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/15"
              />
              <p className="text-xs leading-5 text-white/45">
                Optional. Use this if a team cannot play very late slots.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-100/90">
            These rules are checked when you manually create or edit a fixture,
            and when you generate fixtures for a league. If a fixture breaches
            the rule, the fixture will not be created and you will see a warning.
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-5">
            <button
              type="submit"
              className="inline-flex h-12 items-center justify-center rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-black transition hover:bg-emerald-400"
            >
              Save kick-off rules
            </button>
            <Link
              href="/admin/teams"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-5 text-sm font-medium text-white/75 transition hover:bg-white/10 hover:text-white"
            >
              Back to teams
            </Link>
          </div>
        </form>
      </section>
    </div>
  );
}
