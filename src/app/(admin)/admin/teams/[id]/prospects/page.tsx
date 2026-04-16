// ========================================
// File: src/app/(admin)/admin/teams/[id]/prospects/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";

import FormListboxField from "@/components/ui/FormListboxField";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  addAdminProspectAction,
  convertAdminProspectToMemberAction,
  updateAdminProspectNotesAction,
  updateAdminProspectStatusAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Admin Team Prospects | SIXFL",
};

type SearchParams = {
  saved?: string;
  error?: string;
};

const STATUS_OPTIONS = [
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "TRIAL", label: "Trial" },
  { value: "ACTIVE_SQUAD", label: "Active squad" },
  { value: "BACKUP", label: "Backup" },
  { value: "DECLINED", label: "Declined" },
] as const;

function getSavedMessage(saved?: string) {
  switch (saved) {
    case "prospect-added":
      return "Prospect added.";
    case "status-updated":
      return "Prospect status updated.";
    case "notes-updated":
      return "Prospect notes updated.";
    case "promoted":
      return "Prospect promoted to squad.";
    default:
      return saved ? "Saved." : null;
  }
}

function getStatusLabel(status: string) {
  const option = STATUS_OPTIONS.find((item) => item.value === status);
  return option?.label ?? status;
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

export default async function AdminTeamProspectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();

  const { id } = await params;
  const filters = await searchParams;

  const team = await prisma.team.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      teamMode: true,
      isRecruiting: true,
      joinSlug: true,
      league: {
        select: {
          name: true,
          season: true,
        },
      },
      prospects: {
        orderBy: [{ createdAt: "desc" }],
      },
    },
  });

  if (!team) {
    notFound();
  }

  const savedMessage = getSavedMessage(filters.saved);
  const errorMessage = filters.error ? decodeURIComponent(filters.error) : null;
  const joinUrl = team.joinSlug ? `/teams/join/${team.joinSlug}` : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Link
            href={`/admin/teams/${team.id}`}
            className="text-sm text-emerald-300 hover:text-emerald-200"
          >
            ← Back to team
          </Link>

          <h1 className="text-3xl font-semibold text-white">
            {team.name} prospects
          </h1>

          <p className="text-sm text-white/60">
            Admin oversight for player recruitment, prospect pipeline, and
            organiser-led team growth.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/captain/team/${team.id}/prospects`}
            className="inline-flex items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-100 transition hover:bg-amber-500/15"
          >
            Captain view
          </Link>

          {joinUrl ? (
            <a
              href={joinUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
            >
              Open join page
            </a>
          ) : null}
        </div>
      </div>

      {savedMessage ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          {savedMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          {errorMessage}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-[2rem] border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Recruitment pipeline
            </p>

            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Prospect management
            </h2>

            <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
              Review incoming player interest, move prospects through the
              funnel, and promote players into the active squad.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                Mode: {team.teamMode}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                Recruiting: {team.isRecruiting ? "On" : "Off"}
              </span>
              {team.league ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                  {team.league.name}
                  {team.league.season ? ` · ${team.league.season}` : ""}
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                New
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">
                {team.prospects.filter((item) => item.status === "NEW").length}
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-amber-400/20 bg-amber-500/10 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">
                Trial
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">
                {team.prospects.filter((item) => item.status === "TRIAL").length}
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-emerald-400/20 bg-emerald-500/10 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
                Active squad
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">
                {team.prospects.filter((item) => item.status === "ACTIVE_SQUAD").length}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="text-lg font-semibold text-white">Add prospect</h2>
          <p className="mt-1 text-sm text-white/60">
            Add an individual player manually to the pipeline.
          </p>

          <form action={addAdminProspectAction} className="mt-6 space-y-4">
            <input type="hidden" name="teamId" value={team.id} />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="firstName" className="text-sm text-white/60">
                  First name
                </label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="lastName" className="text-sm text-white/60">
                  Last name
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm text-white/60">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="phone" className="text-sm text-white/60">
                  Phone
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="text"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="preferredPositions"
                className="text-sm text-white/60"
              >
                Preferred positions
              </label>
              <input
                id="preferredPositions"
                name="preferredPositions"
                type="text"
                placeholder="Pivot, defender, winger"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="experienceSummary"
                className="text-sm text-white/60"
              >
                Experience summary
              </label>
              <textarea
                id="experienceSummary"
                name="experienceSummary"
                rows={3}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white outline-none transition focus:border-emerald-500/60"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="availabilitySummary"
                className="text-sm text-white/60"
              >
                Availability summary
              </label>
              <textarea
                id="availabilitySummary"
                name="availabilitySummary"
                rows={3}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white outline-none transition focus:border-emerald-500/60"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="source" className="text-sm text-white/60">
                  Source
                </label>
                <input
                  id="source"
                  name="source"
                  type="text"
                  placeholder="Join page, WhatsApp, referral"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="notes" className="text-sm text-white/60">
                  Notes
                </label>
                <input
                  id="notes"
                  name="notes"
                  type="text"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60"
                />
              </div>
            </div>

            <button
              type="submit"
              className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              Add prospect
            </button>
          </form>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Pipeline
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                Current prospects
              </h2>
            </div>
          </div>

          <div className="divide-y divide-white/10">
            {team.prospects.length === 0 ? (
              <div className="px-6 py-10 text-sm text-white/55">
                No prospects yet.
              </div>
            ) : (
              team.prospects.map((prospect) => (
                <div key={prospect.id} className="space-y-5 px-6 py-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-semibold text-white">
                          {[prospect.firstName, prospect.lastName]
                            .filter(Boolean)
                            .join(" ")}
                        </div>

                        <span
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getStatusClasses(
                            prospect.status,
                          )}`}
                        >
                          {getStatusLabel(prospect.status)}
                        </span>
                      </div>

                      <div className="mt-2 text-sm text-white/65">
                        {prospect.email || "No email"}{" "}
                        {prospect.phone ? `· ${prospect.phone}` : ""}
                      </div>

                      <div className="mt-1 text-xs text-white/45">
                        {prospect.source || "No source"} · Added{" "}
                        {prospect.createdAt.toLocaleString()}
                      </div>

                      {prospect.preferredPositions ? (
                        <div className="mt-2 text-sm text-white/70">
                          Positions: {prospect.preferredPositions}
                        </div>
                      ) : null}

                      {prospect.experienceSummary ? (
                        <div className="mt-2 text-sm text-white/60">
                          {prospect.experienceSummary}
                        </div>
                      ) : null}

                      {prospect.availabilitySummary ? (
                        <div className="mt-2 text-sm text-white/60">
                          Availability: {prospect.availabilitySummary}
                        </div>
                      ) : null}
                    </div>

                    <form
                      action={updateAdminProspectStatusAction}
                      className="min-w-[220px]"
                    >
                      <input type="hidden" name="teamId" value={team.id} />
                      <input
                        type="hidden"
                        name="prospectId"
                        value={prospect.id}
                      />
                      <FormListboxField
                        name="status"
                        value={prospect.status}
                        options={STATUS_OPTIONS.map((option) => ({
                          value: option.value,
                          label: option.label,
                        }))}
                        placeholder="Select status"
                      />
                      <button
                        type="submit"
                        className="mt-3 inline-flex items-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
                      >
                        Update status
                      </button>
                    </form>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                    <form action={updateAdminProspectNotesAction} className="space-y-3">
                      <input type="hidden" name="teamId" value={team.id} />
                      <input type="hidden" name="prospectId" value={prospect.id} />

                      <textarea
                        name="notes"
                        rows={3}
                        defaultValue={prospect.notes ?? ""}
                        placeholder="Internal notes"
                        className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none transition focus:border-emerald-500/60"
                      />

                      <button
                        type="submit"
                        className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
                      >
                        Save notes
                      </button>
                    </form>

                    <form action={convertAdminProspectToMemberAction} className="lg:self-start">
                      <input type="hidden" name="teamId" value={team.id} />
                      <input type="hidden" name="prospectId" value={prospect.id} />
                      <button
                        type="submit"
                        className="inline-flex items-center rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-2.5 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/20"
                      >
                        Promote to squad
                      </button>
                    </form>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}