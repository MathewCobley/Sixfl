// ========================================
// File: src/app/captain/team/[teamid]/prospects/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  NotificationAudience,
  NotificationChannel,
  NotificationDispatchStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import FormListboxField from "@/components/ui/FormListboxField";
import ProspectTemplateMessageForm from "@/components/captain/prospects/ProspectTemplateMessageForm";
import {
  addProspectAction,
  convertProspectToMemberAction,
  sendBulkProspectEmailAction,
  sendBulkProspectSmsAction,
  sendProspectEmailAction,
  sendProspectSmsAction,
  updateProspectNotesAction,
  updateProspectStatusAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Captain Prospects | SIXFL",
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
    case "email-sent":
      return "Prospect email queued.";
    case "sms-sent":
      return "Prospect SMS queued.";
    case "bulk-email-sent":
      return "Bulk prospect email queued.";
    case "bulk-sms-sent":
      return "Bulk prospect SMS queued.";
    default:
      return saved ? "Saved." : null;
  }
}

function getStatusLabel(status: string) {
  const match = STATUS_OPTIONS.find((option) => option.value === status);
  return match?.label ?? status;
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

function getProspectName(input: { firstName: string; lastName: string | null }) {
  return [input.firstName, input.lastName].filter(Boolean).join(" ");
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function getDispatchStatusClasses(status: NotificationDispatchStatus) {
  switch (status) {
    case "QUEUED":
    case "PROCESSING":
      return "border-amber-400/20 bg-amber-500/10 text-amber-100";
    case "SENT":
      return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
    case "FAILED":
    case "CANCELLED":
      return "border-red-400/20 bg-red-500/10 text-red-100";
    case "SKIPPED":
      return "border-white/10 bg-white/5 text-white/70";
    default:
      return "border-white/10 bg-white/5 text-white/70";
  }
}

function getDispatchTimeLabel(input: {
  sentAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
}) {
  return formatDateTime(input.sentAt ?? input.failedAt ?? input.createdAt);
}

export default async function CaptainProspectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamid: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { teamid } = await params;
  const filters = await searchParams;

  await requireCaptain(teamid);

  const [team, emailTemplates, smsTemplates] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamid },
      select: {
        id: true,
        name: true,
        teamMode: true,
        isRecruiting: true,
        joinSlug: true,
        prospects: {
          orderBy: [{ createdAt: "desc" }],
        },
      },
    }),
    prisma.emailTemplate.findMany({
      where: {
        isActive: true,
        audience: {
          in: ["PLAYER", "GENERAL"],
        },
      },
      orderBy: [{ audience: "asc" }, { name: "asc" }],
      select: {
        id: true,
        key: true,
        name: true,
        subject: true,
        body: true,
        description: true,
      },
    }),
    prisma.notificationTemplate.findMany({
      where: {
        channel: NotificationChannel.SMS,
        audience: {
          in: [NotificationAudience.PLAYER, NotificationAudience.GENERAL],
        },
        isActive: true,
      },
      orderBy: [{ audience: "asc" }, { name: "asc" }],
      select: {
        id: true,
        key: true,
        name: true,
        body: true,
        description: true,
      },
    }),
  ]);

  if (!team) {
    notFound();
  }

  const prospectIds = team.prospects.map((prospect) => prospect.id);

  const recentDispatches = prospectIds.length
    ? await prisma.notificationDispatch.findMany({
        where: {
          sourceType: "TEAM_PLAYER_PROSPECT",
          sourceId: {
            in: prospectIds,
          },
          channel: {
            in: [NotificationChannel.EMAIL, NotificationChannel.SMS],
          },
        },
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          sourceId: true,
          channel: true,
          status: true,
          subject: true,
          bodyText: true,
          failureReason: true,
          createdAt: true,
          sentAt: true,
          failedAt: true,
        },
      })
    : [];

  const dispatchMap = new Map<string, typeof recentDispatches>();

  for (const dispatch of recentDispatches) {
    const sourceId = dispatch.sourceId?.trim();

    if (!sourceId) {
      continue;
    }

    const existing = dispatchMap.get(sourceId) ?? [];
    existing.push(dispatch);
    dispatchMap.set(sourceId, existing);
  }

  const savedMessage = getSavedMessage(filters.saved);
  const errorMessage = filters.error ? decodeURIComponent(filters.error) : null;
  const joinUrl = team.joinSlug ? `/teams/join/${team.joinSlug}` : null;
  const absoluteJoinUrl = team.joinSlug
    ? `${process.env.NEXTAUTH_URL ?? "https://www.sixfl.co.uk"}/teams/join/${team.joinSlug}`
    : `${process.env.NEXTAUTH_URL ?? "https://www.sixfl.co.uk"}/register-interest`;
  const prospectsWithEmail = team.prospects.filter((prospect) => Boolean(prospect.email?.trim()));
  const prospectsWithPhone = team.prospects.filter((prospect) => Boolean(prospect.phone?.trim()));

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[2rem] border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Recruitment pipeline
            </p>

            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Team prospects
            </h1>

            <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
              Track individual players who want to join, move them through your pipeline,
              message them directly or in bulk, and promote them into the squad when ready.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                Mode: {team.teamMode}
              </span>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">
                {team.prospects.length} prospect{team.prospects.length === 1 ? "" : "s"}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                Recruiting: {team.isRecruiting ? "On" : "Off"}
              </span>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`/captain/team/${teamid}`}
                className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
              >
                Back to overview
              </Link>

              <Link
                href={`/captain/team/${teamid}/squad`}
                className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/20"
              >
                Open squad
              </Link>

              {joinUrl ? (
                <a
                  href={joinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
                >
                  Open join page
                </a>
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

      <section className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4 text-sm text-sky-100">
        This history is pulled straight from each prospect’s notification dispatches, so these cards show exactly what was queued, sent, failed, skipped, or cancelled for that prospect.
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ProspectTemplateMessageForm
          channel="EMAIL"
          title="Bulk email prospects"
          subtitle="Send one email draft to every checked prospect with an email address."
          action={sendBulkProspectEmailAction}
          hiddenFields={[
            { name: "teamid", value: teamid },
            { name: "teamName", value: team.name },
            { name: "joinUrl", value: absoluteJoinUrl },
            ...prospectsWithEmail.map((prospect) => ({ name: "prospectIds", value: prospect.id })),
          ]}
          emailTemplates={emailTemplates}
          submitLabel="Send bulk email"
          applyPersonalization={false}
        />

        <ProspectTemplateMessageForm
          channel="SMS"
          title="Bulk SMS prospects"
          subtitle="Send one SMS draft to every checked prospect with a mobile number."
          action={sendBulkProspectSmsAction}
          hiddenFields={[
            { name: "teamid", value: teamid },
            { name: "teamName", value: team.name },
            { name: "joinUrl", value: absoluteJoinUrl },
            ...prospectsWithPhone.map((prospect) => ({ name: "prospectIds", value: prospect.id })),
          ]}
          smsTemplates={smsTemplates}
          submitLabel="Send bulk SMS"
          variant="secondary"
          applyPersonalization={false}
        />
      </section>

      <section className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Add manually
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">New prospect</h2>

          <form action={addProspectAction} className="mt-5 space-y-4">
            <input type="hidden" name="teamid" value={teamid} />

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
              <label htmlFor="preferredPositions" className="text-sm text-white/60">
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
              <label htmlFor="experienceSummary" className="text-sm text-white/60">
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
              <label htmlFor="availabilitySummary" className="text-sm text-white/60">
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

        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04]">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Pipeline
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">Current prospects</h2>
            </div>
          </div>

          <div className="divide-y divide-white/10">
            {team.prospects.length === 0 ? (
              <div className="px-6 py-10 text-sm text-white/55">
                No prospects yet. Add one manually or use the public join page.
              </div>
            ) : (
              team.prospects.map((prospect) => {
                const preferredNights = getPreferredNightsDisplay(prospect.preferredNights);
                const prospectName = getProspectName({
                  firstName: prospect.firstName,
                  lastName: prospect.lastName,
                });
                const dispatches = dispatchMap.get(prospect.id) ?? [];
                const emailDispatches = dispatches.filter(
                  (dispatch) => dispatch.channel === NotificationChannel.EMAIL,
                );
                const smsDispatches = dispatches.filter(
                  (dispatch) => dispatch.channel === NotificationChannel.SMS,
                );
                const latestEmailDispatch = emailDispatches[0] ?? null;
                const latestSmsDispatch = smsDispatches[0] ?? null;

                return (
                  <div key={prospect.id} className="space-y-5 px-6 py-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-semibold text-white">
                            {prospectName}
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
                          {prospect.email || "No email"} {prospect.phone ? `· ${prospect.phone}` : ""}
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

                      <form action={updateProspectStatusAction} className="flex flex-wrap items-center gap-3">
                        <input type="hidden" name="teamid" value={teamid} />
                        <input type="hidden" name="prospectId" value={prospect.id} />

                        <div className="min-w-[220px]">
                          <FormListboxField
                            name="status"
                            value={prospect.status}
                            options={STATUS_OPTIONS.map((option) => ({
                              value: option.value,
                              label: option.label,
                            }))}
                            placeholder="Select status"
                          />
                        </div>

                        <button
                          type="submit"
                          className="inline-flex items-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
                        >
                          Update status
                        </button>
                      </form>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                      <form action={updateProspectNotesAction} className="space-y-3">
                        <input type="hidden" name="teamid" value={teamid} />
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

                      <form action={convertProspectToMemberAction} className="lg:self-start">
                        <input type="hidden" name="teamid" value={teamid} />
                        <input type="hidden" name="prospectId" value={prospect.id} />
                        <button
                          type="submit"
                          className="inline-flex items-center rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-2.5 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/20"
                        >
                          Promote to squad
                        </button>
                      </form>
                    </div>

                    <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                            Communication history
                          </p>
                          <p className="mt-1 text-sm text-white/65">
                            Outbound activity is shown directly from this prospect’s email and SMS dispatch records.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-white/55">
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                            Email: {emailDispatches.length} msg
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                            SMS: {smsDispatches.length} msg
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4 xl:grid-cols-2">
                        {[
                          {
                            title: "Email history",
                            latest: latestEmailDispatch,
                            items: emailDispatches,
                          },
                          {
                            title: "SMS history",
                            latest: latestSmsDispatch,
                            items: smsDispatches,
                          },
                        ].map((group) => (
                          <div
                            key={group.title}
                            className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold text-white">{group.title}</div>
                                <div className="mt-1 text-xs text-white/45">
                                  {group.latest
                                    ? `Latest ${group.latest.status.toLowerCase()} ${getDispatchTimeLabel(group.latest)}`
                                    : "No messages yet"}
                                </div>
                              </div>

                              {group.latest ? (
                                <span
                                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getDispatchStatusClasses(
                                    group.latest.status,
                                  )}`}
                                >
                                  {group.latest.status}
                                </span>
                              ) : null}
                            </div>

                            {group.items.length > 0 ? (
                              <div className="mt-4 space-y-3">
                                {group.items.slice(0, 5).map((dispatch) => (
                                  <div
                                    key={dispatch.id}
                                    className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white/80"
                                  >
                                    <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.14em] text-white/45">
                                      <span>{dispatch.channel}</span>
                                      <span>{getDispatchTimeLabel(dispatch)}</span>
                                    </div>
                                    <div className="mt-2 flex items-center gap-2">
                                      <span
                                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${getDispatchStatusClasses(
                                          dispatch.status,
                                        )}`}
                                      >
                                        {dispatch.status}
                                      </span>
                                      {dispatch.subject ? (
                                        <span className="truncate text-xs text-white/50">
                                          {dispatch.subject}
                                        </span>
                                      ) : null}
                                    </div>
                                    <div className="mt-2 whitespace-pre-wrap break-words leading-6">
                                      {dispatch.bodyText}
                                    </div>
                                    {dispatch.failureReason ? (
                                      <div className="mt-2 text-xs text-red-200/80">
                                        {dispatch.failureReason}
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-2">
                      <ProspectTemplateMessageForm
                        channel="EMAIL"
                        title="Email prospect"
                        subtitle={`To: ${prospect.email || "No email"}`}
                        action={sendProspectEmailAction}
                        hiddenFields={[
                          { name: "teamid", value: teamid },
                          { name: "prospectId", value: prospect.id },
                          { name: "teamName", value: team.name },
                          { name: "joinUrl", value: absoluteJoinUrl },
                          { name: "prospectFirstName", value: prospect.firstName },
                          { name: "prospectFullName", value: prospectName },
                          { name: "prospectEmail", value: prospect.email ?? "" },
                        ]}
                        emailTemplates={emailTemplates}
                        submitLabel="Send email"
                      />

                      <ProspectTemplateMessageForm
                        channel="SMS"
                        title="SMS prospect"
                        subtitle={`To: ${prospect.phone || "No phone"}`}
                        action={sendProspectSmsAction}
                        hiddenFields={[
                          { name: "teamid", value: teamid },
                          { name: "prospectId", value: prospect.id },
                          { name: "teamName", value: team.name },
                          { name: "joinUrl", value: absoluteJoinUrl },
                          { name: "prospectFirstName", value: prospect.firstName },
                          { name: "prospectFullName", value: prospectName },
                          { name: "prospectEmail", value: prospect.email ?? "" },
                        ]}
                        smsTemplates={smsTemplates}
                        submitLabel="Send SMS"
                        variant="secondary"
                      />
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
