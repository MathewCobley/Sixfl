// ========================================
// File: src/app/(admin)/admin/teams/[id]/shin-pad-warnings/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { getTeamShinPadWarningRecords } from "@/lib/fixtures/shin-pad-warning-records";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatDate(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getEmailStatusLabel(input: {
  notificationStatus: string | null;
  emailSentTo: string | null;
}) {
  if (!input.emailSentTo) return "No team email available";

  switch (input.notificationStatus) {
    case "SENT":
      return "Email sent";
    case "QUEUED":
      return "Email queued";
    case "PROCESSING":
      return "Email processing";
    case "FAILED":
      return "Email failed";
    case "SKIPPED":
      return "Email skipped";
    case "CANCELLED":
      return "Email cancelled";
    default:
      return "Email not queued";
  }
}

function getEmailStatusTone(status: string | null, emailSentTo: string | null) {
  if (!emailSentTo) {
    return "border-amber-400/25 bg-amber-500/10 text-amber-100";
  }

  switch (status) {
    case "SENT":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "QUEUED":
    case "PROCESSING":
      return "border-sky-400/25 bg-sky-500/10 text-sky-100";
    case "FAILED":
    case "CANCELLED":
    case "SKIPPED":
      return "border-red-400/25 bg-red-500/10 text-red-100";
    default:
      return "border-white/10 bg-white/5 text-white/60";
  }
}

export default async function TeamShinPadWarningsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const [team, warnings] = await Promise.all([
    prisma.team.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        league: {
          select: {
            name: true,
            season: true,
          },
        },
      },
    }),
    getTeamShinPadWarningRecords(id),
  ]);

  if (!team) notFound();

  const count = warnings.length;
  const actionRequired = count >= 3;
  const repeated = count >= 2;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link
          href={`/admin/teams/${team.id}`}
          className="text-sm text-emerald-300 hover:text-emerald-200"
        >
          ← Back to team
        </Link>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200/80">
          Safety record
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          {team.name} shin pad warnings
        </h1>
        <p className="mt-2 text-sm text-white/60">
          {team.league
            ? `${team.league.name}${team.league.season ? ` · ${team.league.season}` : ""}`
            : "No league assigned"}
        </p>
      </div>

      <section
        className={[
          "rounded-3xl border p-6",
          actionRequired
            ? "border-red-400/35 bg-red-500/12"
            : repeated
              ? "border-amber-300/35 bg-amber-400/12"
              : "border-white/10 bg-white/[0.04]",
        ].join(" ")}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Total warnings
            </p>
            <p className="mt-2 text-4xl font-semibold text-white">{count}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Admin level
            </p>
            <p className="mt-2 text-lg font-semibold text-white">
              {actionRequired
                ? "Action required"
                : repeated
                  ? "Repeated issue"
                  : count === 1
                    ? "Monitor"
                    : "Clear"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Latest warning
            </p>
            <p className="mt-2 text-sm font-medium text-white">
              {warnings[0] ? formatDate(warnings[0].kickoffAt) : "None"}
            </p>
          </div>
        </div>

        {actionRequired ? (
          <div className="mt-5 rounded-2xl border border-red-300/25 bg-black/20 p-4 text-sm leading-6 text-red-50">
            This team has reached three or more warnings. Contact the team before
            its next fixture and confirm that every player will wear shin pads.
          </div>
        ) : repeated ? (
          <div className="mt-5 rounded-2xl border border-amber-300/25 bg-black/20 p-4 text-sm leading-6 text-amber-50">
            The issue has happened more than once. Admin should review the history
            and consider contacting the team directly.
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 px-6 py-5">
          <h2 className="text-xl font-semibold text-white">Warning history</h2>
          <p className="mt-2 text-sm text-white/55">
            Each team can receive one recorded shin pad warning per fixture.
          </p>
        </div>

        {warnings.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-white/50">
            No shin pad warnings have been recorded for this team.
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {warnings.map((warning, index) => (
              <article key={warning.id} className="space-y-4 px-6 py-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-100">
                        Warning {count - index}
                      </span>
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${getEmailStatusTone(
                          warning.notificationStatus,
                          warning.emailSentTo,
                        )}`}
                      >
                        {getEmailStatusLabel(warning)}
                      </span>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-white">
                      {warning.homeTeamName} v {warning.awayTeamName}
                    </h3>
                    <p className="mt-1 text-sm text-white/55">
                      {formatDate(warning.kickoffAt)}
                      {warning.venueName ? ` · ${warning.venueName}` : ""}
                    </p>
                  </div>

                  <div className="text-left text-xs leading-5 text-white/40 sm:text-right">
                    <div>Recorded {formatDate(warning.createdAt)}</div>
                    <div>
                      By {warning.reportedByName || warning.reportedByEmail || "referee"}
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">
                      Email recipient
                    </div>
                    <div className="mt-2 break-all text-white/70">
                      {warning.emailSentTo || "No email was available"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">
                      Delivery detail
                    </div>
                    <div className="mt-2 text-white/70">
                      {warning.emailSentAt
                        ? `Sent ${formatDate(warning.emailSentAt)}`
                        : warning.notificationFailureReason ||
                          getEmailStatusLabel(warning)}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link
                    href={`/admin/teams/${team.id}/communications`}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
                  >
                    Open team communications
                  </Link>
                  {warning.refereeNightId ? (
                    <Link
                      href={`/admin/referee-nights/${warning.refereeNightId}`}
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white/75 transition hover:bg-white/10"
                    >
                      Open referee night
                    </Link>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
