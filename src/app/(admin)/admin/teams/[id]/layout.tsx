// ========================================
// File: src/app/(admin)/admin/teams/[id]/layout.tsx
// ========================================

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import TeamKitColourPicker from "@/components/admin/teams/TeamKitColourPicker";
import TeamOverviewOnly from "@/components/admin/teams/TeamOverviewOnly";
import TeamShinPadWarningPanel from "@/components/admin/teams/TeamShinPadWarningPanel";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TeamKickoffRuleRow = {
  id: string;
  name: string;
  earliestKickoffTime: string | null;
  latestKickoffTime: string | null;
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

export default async function AdminTeamDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  const rows = await prisma.$queryRaw<TeamKickoffRuleRow[]>`
    SELECT
      "id",
      "name",
      "earliestKickoffTime",
      "latestKickoffTime"
    FROM "Team"
    WHERE "id" = ${id}
    LIMIT 1
  `;
  const team = rows[0] ?? null;

  if (!team) {
    notFound();
  }

  return (
    <div className="space-y-5">
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
      </TeamOverviewOnly>

      {children}
    </div>
  );
}
