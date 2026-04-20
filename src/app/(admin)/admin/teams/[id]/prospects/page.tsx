// ========================================
// File: src/app/(admin)/admin/teams/[id]/prospects/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";

import FormListboxField from "@/components/ui/FormListboxField";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  sendBulkProspectMessageAction,
  sendProspectMessageAction,
} from "../../actions";
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

type SearchParams = Record<string, string | string[] | undefined>;

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

function getProspectMessage(searchParams: SearchParams) {
  const singleQueued =
    typeof searchParams.prospectQueued === "string"
      ? searchParams.prospectQueued
      : undefined;
  const bulkQueued =
    typeof searchParams.prospectBulkQueued === "string"
      ? searchParams.prospectBulkQueued
      : undefined;
  const channel =
    typeof searchParams.channel === "string" ? searchParams.channel : "email";

  if (singleQueued === "1") {
    return `Prospect ${channel === "sms" ? "SMS" : "email"} queued.`;
  }

  if (bulkQueued === "1") {
    return `Bulk prospect ${channel === "sms" ? "SMS" : "email"} queued.`;
  }

  return null;
}

function getProspectError(searchParams: SearchParams) {
  const error =
    typeof searchParams.prospectComposeError === "string"
      ? searchParams.prospectComposeError
      : null;

  switch (error) {
    case "missing_subject":
      return "Email subject is required.";
    case "missing_body":
      return "Message body is required.";
    case "missing_email":
      return "That prospect does not have an email address.";
    case "missing_phone":
      return "That prospect does not have a mobile number.";
    case "email_not_configured":
      return "Email is not configured yet. Add RESEND_API_KEY and EMAIL_FROM first.";
    case "no_recipients":
      return "No matching prospects were available for that bulk send.";
    default:
      return null;
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

function getPreferredNightsDisplay(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const nights = value.filter((item): item is string => typeof item === "string");
  return nights.length > 0 ? nights.join(", ") : null;
}

function getProspectName(input: {
  firstName: string;
  lastName: string | null;
}) {
  return [input.firstName, input.lastName].filter(Boolean).join(" ");
}

function StatCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: number;
  subtext: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm text-white/55">{subtext}</p>
    </div>
  );
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
          id: true,
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

  const saved = typeof filters.saved === "string" ? filters.saved : undefined;
  const error = typeof filters.error === "string" ? filters.error : undefined;
  const savedMessage = getSavedMessage(saved);
  const prospectMessage = getProspectMessage(filters);
  const prospectError = getProspectError(filters);
  const errorMessage = error ? decodeURIComponent(error) : null;
  const joinUrl = team.joinSlug ? `/teams/join/${team.joinSlug}` : null;
  const prospectsWithEmail = team.prospects.filter((prospect) =>
    Boolean(prospect.email?.trim()),
  );
  const prospectsWithPhone = team.prospects.filter((prospect) =>
    Boolean(prospect.phone?.trim()),
  );

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
            Admin oversight for player recruitment, prospect pipeline, and organiser-led team growth.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/captain/team/${team.id}/prospects`}
            className="inline-flex items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-100 transition hover:bg-amber-500/15"
          >
            Captain view
          </Link>

          <Link
            href={`/admin/teams/${team.id}/communications`}
            className="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
          >
            Team communications
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

      {prospectMessage ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          {prospectMessage}
        </div>
      ) : null}

      {prospectError ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
          {prospectError}
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
              Review incoming player interest, move prospects through the funnel, email or text them directly, and promote players into the active squad.
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

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
            <StatCard
              label="TOTAL"
              value={team.prospects.length}
              subtext="All prospects"
            />
            <StatCard
              label="EMAIL READY"
              value={prospectsWithEmail.length}
              subtext="Have email address"
            />
            <StatCard
              label="SMS READY"
              value={prospectsWithPhone.length}
              subtext="Have mobile number"
            />
            <StatCard
              label="NEW"
              value={team.prospects.filter((item) => item.status === "NEW").length}
              subtext="Not yet contacted"
            />
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-6">
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

          <form
            action={sendBulkProspectMessageAction}
            className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_42%),rgba(255,255,255,0.03)] p-6"
          >
            <input type="hidden" name="teamId" value={team.id} />
            <input type="hidden" name="from" value={`/admin/teams/${team.id}/prospects`} />
            <input type="hidden" name="channel" value="EMAIL" />

            <div className="text-[11px] font-bold tracking-[0.2em] text-emerald-300/80">
              BULK EMAIL
            </div>
            <div className="mt-2 text-xl font-semibold text-white">
              Email selected prospects
            </div>
            <div className="mt-1 text-sm text-white/60">
              Send one email draft to every checked prospect who has an email address.
            </div>

            <div className="mt-5 space-y-3">
              <input
                name="subject"
                placeholder="Subject"
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-emerald-400"
              />
              <textarea
                name="body"
                rows={6}
                placeholder="Hi {{firstName}}, ..."
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-emerald-400"
              />
            </div>

            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-4">
              {prospectsWithEmail.length === 0 ? (
                <div className="text-sm text-white/55">No prospects with email addresses yet.</div>
              ) : (
                prospectsWithEmail.map((prospect) => (
                  <label
                    key={prospect.id}
                    className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"
                  >
                    <input
                      type="checkbox"
                      name="prospectIds"
                      value={prospect.id}
                      defaultChecked
                      className="mt-1 h-4 w-4 rounded border-white/20 bg-black text-emerald-500"
                    />
                    <div>
                      <div className="text-sm font-medium text-white">
                        {getProspectName({
                          firstName: prospect.firstName,
                          lastName: prospect.lastName,
                        })}
                      </div>
                      <div className="text-sm text-white/55">{prospect.email}</div>
                    </div>
                  </label>
                ))
              )}
            </div>

            <button
              type="submit"
              className="mt-4 inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              Queue bulk email
            </button>
          </form>

          <form
            action={sendBulkProspectMessageAction}
            className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_42%),rgba(255,255,255,0.03)] p-6"
          >
            <input type="hidden" name="teamId" value={team.id} />
            <input type="hidden" name="from" value={`/admin/teams/${team.id}/prospects`} />
            <input type="hidden" name="channel" value="SMS" />

            <div className="text-[11px] font-bold tracking-[0.2em] text-emerald-300/80">
              BULK SMS
            </div>
            <div className="mt-2 text-xl font-semibold text-white">
              SMS selected prospects
            </div>
            <div className="mt-1 text-sm text-white/60">
              Send one SMS draft to every checked prospect who has a mobile number.
            </div>

            <div className="mt-5 space-y-3">
              <textarea
                name="body"
                rows={6}
                placeholder="Hi {{firstName}}, ..."
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-emerald-400"
              />
            </div>

            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-4">
              {prospectsWithPhone.length === 0 ? (
                <div className="text-sm text-white/55">No prospects with mobile numbers yet.</div>
              ) : (
                prospectsWithPhone.map((prospect) => (
                  <label
                    key={prospect.id}
                    className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"
                  >
                    <input
                      type="checkbox"
                      name="prospectIds"
                      value={prospect.id}
                      defaultChecked
                      className="mt-1 h-4 w-4 rounded border-white/20 bg-black text-emerald-500"
                    />
                    <div>
                      <div className="text-sm font-medium text-white">
                        {getProspectName({
                          firstName: prospect.firstName,
                          lastName: prospect.lastName,
                        })}
                      </div>
                      <div className="text-sm text-white/55">{prospect.phone}</div>
                    </div>
                  </label>
                ))
              )}
            </div>

            <button
              type="submit"
              className="mt-4 inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Queue bulk SMS
            </button>
          </form>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                PIPELINE + OUTREACH
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
              team.prospects.map((prospect) => {
                const preferredNights = getPreferredNightsDisplay(prospect.preferredNights);

                return (
                  <div key={prospect.id} className="space-y-5 px-6 py-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-semibold text-white">
                            {getProspectName({
                              firstName: prospect.firstName,
                              lastName: prospect.lastName,
                            })}
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
                          {prospect.source || "No source"} · Added {prospect.createdAt.toLocaleString()}
                        </div>

                        {prospect.ageBand ? (
                          <div className="mt-2 text-sm text-white/70">
                            Age band: {prospect.ageBand}
                          </div>
                        ) : null}

                        {prospect.preferredPositions ? (
                          <div className="mt-2 text-sm text-white/70">
                            Position: {prospect.preferredPositions}
                          </div>
                        ) : null}

                        {prospect.experienceSummary ? (
                          <div className="mt-2 text-sm text-white/60">
                            Experience: {prospect.experienceSummary}
                          </div>
                        ) : null}

                        {prospect.availabilityLevel ? (
                          <div className="mt-2 text-sm text-white/60">
                            Availability level: {prospect.availabilityLevel}
                          </div>
                        ) : null}

                        {preferredNights ? (
                          <div className="mt-2 text-sm text-white/60">
                            Preferred nights: {preferredNights}
                          </div>
                        ) : null}

                        {prospect.availabilitySummary ? (
                          <div className="mt-2 text-sm text-white/50">
                            {prospect.availabilitySummary}
                          </div>
                        ) : null}
                      </div>

                      <div className="min-w-[220px]">
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
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="submit"
                              className="inline-flex items-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
                            >
                              Update status
                            </button>
                            <Link
                              href={`/admin/teams/${team.id}/prospects/${prospect.id}/communications`}
                              className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
                            >
                              Communications
                            </Link>
                          </div>
                        </form>
                      </div>
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

                    <div className="grid gap-4 xl:grid-cols-2">
                      <form
                        action={sendProspectMessageAction}
                        className="rounded-2xl border border-white/10 bg-black/20 p-4"
                      >
                        <input type="hidden" name="teamId" value={team.id} />
                        <input type="hidden" name="prospectId" value={prospect.id} />
                        <input
                          type="hidden"
                          name="from"
                          value={`/admin/teams/${team.id}/prospects`}
                        />
                        <input type="hidden" name="channel" value="EMAIL" />

                        <div className="text-sm font-semibold text-white">Individual email</div>
                        <div className="mt-1 text-xs text-white/45">To: {prospect.email || "No email"}</div>

                        <div className="mt-4 space-y-3">
                          <input
                            name="subject"
                            placeholder="Subject"
                            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-emerald-400"
                          />
                          <textarea
                            name="body"
                            rows={5}
                            placeholder="Hi {{firstName}}, ..."
                            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-emerald-400"
                          />
                        </div>

                        <button
                          type="submit"
                          className="mt-4 inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
                        >
                          Queue email
                        </button>
                      </form>

                      <form
                        action={sendProspectMessageAction}
                        className="rounded-2xl border border-white/10 bg-black/20 p-4"
                      >
                        <input type="hidden" name="teamId" value={team.id} />
                        <input type="hidden" name="prospectId" value={prospect.id} />
                        <input
                          type="hidden"
                          name="from"
                          value={`/admin/teams/${team.id}/prospects`}
                        />
                        <input type="hidden" name="channel" value="SMS" />

                        <div className="text-sm font-semibold text-white">Individual SMS</div>
                        <div className="mt-1 text-xs text-white/45">To: {prospect.phone || "No phone"}</div>

                        <div className="mt-4 space-y-3">
                          <textarea
                            name="body"
                            rows={5}
                            placeholder="Hi {{firstName}}, ..."
                            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-emerald-400"
                          />
                        </div>

                        <button
                          type="submit"
                          className="mt-4 inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
                        >
                          Queue SMS
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
