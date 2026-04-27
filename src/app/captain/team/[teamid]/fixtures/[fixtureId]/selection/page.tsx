// ========================================
// File: src/app/captain/team/[teamid]/fixtures/[fixtureId]/selection/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";

import FormListboxField from "@/components/ui/FormListboxField";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { updateFixtureSelectionAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Captain Fixture Selection | SIXFL",
};

type SearchParams = {
  saved?: string;
  error?: string;
};

const selectionOptions = [
  { value: "SELECTED", label: "Selected" },
  { value: "BACKUP", label: "Backup" },
  { value: "NOT_SELECTED", label: "Not selected" },
];

function formatDateTime(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSavedMessage(saved?: string) {
  switch (saved) {
    case "selection-updated":
      return "Selection updated.";
    default:
      return saved ? "Saved." : null;
  }
}

function getAvailabilityClasses(response: string) {
  switch (response) {
    case "AVAILABLE":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "MAYBE":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    case "UNAVAILABLE":
      return "border-red-400/25 bg-red-500/10 text-red-100";
    default:
      return "border-white/10 bg-white/5 text-white/75";
  }
}

function getSelectionClasses(status: string) {
  switch (status) {
    case "SELECTED":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "BACKUP":
      return "border-violet-400/25 bg-violet-500/10 text-violet-100";
    default:
      return "border-white/10 bg-white/5 text-white/75";
  }
}

export default async function CaptainFixtureSelectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamid: string; fixtureId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { teamid, fixtureId } = await params;
  const filters = await searchParams;

  await requireCaptain(teamid);

  const fixture = await prisma.fixture.findFirst({
    where: {
      id: fixtureId,
      OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],
    },
    include: {
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
      venue: { select: { name: true } },
      availabilities: {
        where: {
          teamMember: {
            teamId: teamid,
          },
        },
        select: {
          teamMemberId: true,
          response: true,
          note: true,
        },
      },
      selections: {
        where: {
          teamMember: {
            teamId: teamid,
          },
        },
        select: {
          teamMemberId: true,
          selectionStatus: true,
          isCaptain: true,
          isGoalkeeper: true,
          note: true,
        },
      },
    },
  });

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      members: {
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          role: true,
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!fixture || !team) {
    notFound();
  }

  const availabilityByMemberId = new Map(
    fixture.availabilities.map((item) => [item.teamMemberId, item]),
  );
  const selectionByMemberId = new Map(
    fixture.selections.map((item) => [item.teamMemberId, item]),
  );

  const selectedCount = fixture.selections.filter(
    (item) => item.selectionStatus === "SELECTED",
  ).length;
  const backupCount = fixture.selections.filter(
    (item) => item.selectionStatus === "BACKUP",
  ).length;

  const savedMessage = getSavedMessage(filters.saved);
  const errorMessage = filters.error ? decodeURIComponent(filters.error) : null;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Matchday squad
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Selection
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
              Pick your selected squad, assign backups, and tag captain and goalkeeper for this fixture.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                {fixture.homeTeam.name} vs {fixture.awayTeam.name}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                {formatDateTime(fixture.kickoffAt)}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                {fixture.venue?.name ?? "Venue TBC"}
              </span>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`/captain/team/${teamid}/availability`}
                className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
              >
                Back to availability
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
                Selected
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">{selectedCount}</p>
            </div>
            <div className="rounded-3xl border border-violet-400/20 bg-violet-500/10 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-100/70">
                Backups
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">{backupCount}</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                Squad pool
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">{team.members.length}</p>
            </div>
          </div>
        </div>
      </section>

      {savedMessage ? (
        <section className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          {savedMessage}
        </section>
      ) : null}

      {errorMessage ? (
        <section className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          {errorMessage}
        </section>
      ) : null}

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
        <div className="divide-y divide-white/10">
          {team.members.map((member) => {
            const availability = availabilityByMemberId.get(member.id);
            const selection = selectionByMemberId.get(member.id);

            const response = availability?.response ?? "NO_RESPONSE";
            const selectionStatus = selection?.selectionStatus ?? "NOT_SELECTED";
            const memberName = member.user.name || member.user.email || "Unnamed user";

            return (
              <div
                key={member.id}
                className="grid gap-5 px-6 py-5 xl:grid-cols-[1fr_360px]"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-base font-semibold text-white">{memberName}</div>

                    <span
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getAvailabilityClasses(
                        response,
                      )}`}
                    >
                      {response.replace("_", " ")}
                    </span>

                    <span
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getSelectionClasses(
                        selectionStatus,
                      )}`}
                    >
                      {selectionStatus.replace("_", " ")}
                    </span>

                    {selection?.isCaptain ? (
                      <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-100">
                        Captain
                      </span>
                    ) : null}

                    {selection?.isGoalkeeper ? (
                      <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-100">
                        Goalkeeper
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2 text-sm text-white/60">
                    {member.user.email || "No email on account"}
                  </div>

                  {availability?.note ? (
                    <div className="mt-2 text-sm text-white/55">
                      Availability note: {availability.note}
                    </div>
                  ) : null}

                  {selection?.note ? (
                    <div className="mt-2 text-sm text-white/55">
                      Selection note: {selection.note}
                    </div>
                  ) : null}
                </div>

                <form action={updateFixtureSelectionAction} className="space-y-3">
                  <input type="hidden" name="teamid" value={teamid} />
                  <input type="hidden" name="fixtureId" value={fixtureId} />
                  <input type="hidden" name="teamMemberId" value={member.id} />

                  <FormListboxField
                    name="selectionStatus"
                    value={selectionStatus}
                    options={selectionOptions}
                    placeholder="Select status"
                  />

                  <input
                    name="note"
                    type="text"
                    defaultValue={selection?.note ?? ""}
                    placeholder="Optional note"
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none transition focus:border-emerald-500/60"
                  />

                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm text-white/75">
                      <input
                        type="checkbox"
                        name="isCaptain"
                        defaultChecked={Boolean(selection?.isCaptain)}
                      />
                      Captain
                    </label>

                    <label className="flex items-center gap-2 text-sm text-white/75">
                      <input
                        type="checkbox"
                        name="isGoalkeeper"
                        defaultChecked={Boolean(selection?.isGoalkeeper)}
                      />
                      Goalkeeper
                    </label>
                  </div>

                  <button
                    type="submit"
                    className="inline-flex items-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
                  >
                    Save selection
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}