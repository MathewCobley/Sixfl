// ========================================
// File: src/app/captain/team/[teamid]/prospects/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  NotificationChannel,
  NotificationDispatchStatus,
} from "@prisma/client";

import ProspectInterestChaseCard from "@/components/captain/prospects/ProspectInterestChaseCard";
import FormListboxField from "@/components/ui/FormListboxField";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import {
  addProspectAction,
  convertProspectToMemberAction,
  updateProspectDetailsAction,
  updateProspectNotesAction,
  updateProspectStatusAction,
} from "./actions";
import { sendProspectInterestChaseAction } from "./chase-actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Captain Prospects | SIXFL",
};

type SearchParams = {
  saved?: string;
  error?: string;
};

type ProspectRecord = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  ageBand: string | null;
  preferredPositions: string | null;
  experienceSummary: string | null;
  availabilityLevel: string | null;
  preferredNights: unknown;
  availabilitySummary: string | null;
  source: string | null;
  status: string;
  lastContactedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ProspectPromotionState = {
  canPromote: boolean;
  reason: string;
  tone: "ready" | "warning" | "muted";
  showSignupCta: boolean;
  signupLabel: string;
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
    case "details-updated":
      return "Prospect details updated.";
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
    case "interest-chase-sent":
      return "Prospect chase queued and recorded on the prospect card.";
    default:
      return saved ? "Saved." : null;
  }
}

function getStatusLabel(status: string) {
  const match = STATUS_OPTIONS.find((option) => option.value === status);
  if (status === "QUALIFIED") return "Still interested";
  if (status === "CLOSED") return "Not interested";
  return match?.label ?? status;
}

function getStatusClasses(status: string) {
  switch (status) {
    case "CONTACTED":
      return "border-sky-400/25 bg-sky-500/10 text-sky-100";
    case "TRIAL":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    case "ACTIVE_SQUAD":
    case "QUALIFIED":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "BACKUP":
      return "border-violet-400/25 bg-violet-500/10 text-violet-100";
    case "DECLINED":
    case "CLOSED":
      return "border-red-400/25 bg-red-500/10 text-red-100";
    default:
      return "border-white/10 bg-white/5 text-white/75";
  }
}

function getPreferredNightsDisplay(value: unknown) {
  if (!Array.isArray(value)) return null;
  const nights = value.filter((item): item is string => typeof item === "string");
  return nights.length > 0 ? nights.join(", ") : null;
}

function getProspectName(input: { firstName: string; lastName: string | null }) {
  return [input.firstName, input.lastName].filter(Boolean).join(" ").trim() || input.firstName;
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) return null;
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatUkDateTime(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function countCompletedProfileFields(prospect: ProspectRecord) {
  const preferredNights = Array.isArray(prospect.preferredNights)
    ? prospect.preferredNights.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0,
      )
    : [];

  const values = [
    prospect.ageBand,
    prospect.preferredPositions,
    prospect.experienceSummary,
    prospect.availabilityLevel,
    preferredNights.length > 0 ? preferredNights.join(", ") : null,
    prospect.availabilitySummary,
  ];

  return values.filter((value) => typeof value === "string" && value.trim().length > 0).length;
}

function hasCompletedProspectForm(prospect: ProspectRecord) {
  return countCompletedProfileFields(prospect) >= 4;
}

function getCompletionBadgeClasses(isComplete: boolean) {
  return isComplete
    ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
    : "border-white/10 bg-white/5 text-white/60";
}

function getCompletionLabel(prospect: ProspectRecord) {
  return hasCompletedProspectForm(prospect) ? "Form completed" : "Form not completed";
}

function getPromotionState(input: {
  prospect: ProspectRecord;
  hasLinkedUser: boolean;
  isExistingTeamMember: boolean;
}): ProspectPromotionState {
  if (input.isExistingTeamMember) {
    return {
      canPromote: false,
      reason: "This player already has a SIXFL account linked to this team.",
      tone: "muted",
      showSignupCta: false,
      signupLabel: "",
    };
  }

  if (input.prospect.status === "ACTIVE_SQUAD") {
    return {
      canPromote: false,
      reason: input.hasLinkedUser
        ? "Already in the active squad and ready to appear as a linked player."
        : "Already in the active squad. They can register later and will link when added as a SIXFL user.",
      tone: "muted",
      showSignupCta: !input.hasLinkedUser,
      signupLabel: "Open signup link",
    };
  }

  if (!input.prospect.email?.trim()) {
    return {
      canPromote: true,
      reason: "You can promote this prospect now. Add and save an email later if you want to link them to a SIXFL account.",
      tone: "warning",
      showSignupCta: false,
      signupLabel: "",
    };
  }

  if (!input.hasLinkedUser) {
    return {
      canPromote: true,
      reason: "You can promote this prospect now. They will show in the squad straight away, and you can get them to register later using the same email.",
      tone: "warning",
      showSignupCta: true,
      signupLabel: "Open signup link",
    };
  }

  return {
    canPromote: true,
    reason: "Ready to promote. Save any detail changes first, then move them into the squad.",
    tone: "ready",
    showSignupCta: false,
    signupLabel: "",
  };
}

function getPromotionStateClasses(tone: ProspectPromotionState["tone"]) {
  switch (tone) {
    case "ready":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "warning":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    default:
      return "border-white/10 bg-white/5 text-white/65";
  }
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

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      name: true,
      teamMode: true,
      isRecruiting: true,
      joinSlug: true,
      prospects: {
        where: { status: { not: "ACTIVE_SQUAD" } },
        orderBy: [{ createdAt: "desc" }],
      },
    },
  });

  if (!team) notFound();

  const typedProspects = team.prospects as ProspectRecord[];
  const prospectIds = typedProspects.map((prospect) => prospect.id);
  const prospectEmails = Array.from(
    new Set(
      typedProspects
        .map((prospect) => prospect.email?.trim().toLowerCase() ?? null)
        .filter((email): email is string => Boolean(email)),
    ),
  );

  const [recentDispatches, linkedUsersRaw] = await Promise.all([
    prospectIds.length
      ? prisma.notificationDispatch.findMany({
          where: {
            sourceType: "TEAM_PLAYER_PROSPECT",
            sourceId: { in: prospectIds },
            channel: { in: [NotificationChannel.EMAIL, NotificationChannel.SMS] },
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
      : [],
    prospectEmails.length
      ? prisma.user.findMany({
          where: { email: { in: prospectEmails } },
          select: {
            id: true,
            email: true,
            teamMembers: { where: { teamId: teamid }, select: { id: true } },
          },
        })
      : [],
  ]);

  const linkedUserByEmail = new Map<string, (typeof linkedUsersRaw)[number]>();
  for (const user of linkedUsersRaw) {
    const normalizedEmail = (user.email ?? "").trim().toLowerCase();
    if (normalizedEmail) linkedUserByEmail.set(normalizedEmail, user);
  }

  const dispatchMap = new Map<string, typeof recentDispatches>();
  for (const dispatch of recentDispatches) {
    const sourceId = dispatch.sourceId?.trim();
    if (!sourceId) continue;
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
  const completedProspectsCount = typedProspects.filter(hasCompletedProspectForm).length;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">Recruitment pipeline</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Team prospects</h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
              Track individual players who want to join, chase them with a quick YES/NO message, and promote them into the squad when ready.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">Mode: {team.teamMode}</span>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">{typedProspects.length} prospect{typedProspects.length === 1 ? "" : "s"}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">Recruiting: {team.isRecruiting ? "On" : "Off"}</span>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={`/captain/team/${teamid}`} className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white">Back to overview</Link>
              <Link href={`/captain/team/${teamid}/squad`} className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/20">Open squad</Link>
              {joinUrl ? <a href={joinUrl} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white">Open join page</a> : null}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">New</p><p className="mt-3 text-3xl font-semibold text-white">{typedProspects.filter((item) => item.status === "NEW").length}</p></div>
            <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">Form completed</p><p className="mt-3 text-3xl font-semibold text-white">{completedProspectsCount}</p></div>
            <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">Trial</p><p className="mt-3 text-3xl font-semibold text-white">{typedProspects.filter((item) => item.status === "TRIAL").length}</p></div>
            <div className="rounded-3xl border border-cyan-400/20 bg-cyan-500/10 p-5"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">Contactable</p><p className="mt-3 text-3xl font-semibold text-white">{typedProspects.filter((item) => item.email || item.phone).length}</p></div>
          </div>
        </div>
      </section>

      {savedMessage ? <section className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">{savedMessage}</section> : null}
      {errorMessage ? <section className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">{errorMessage}</section> : null}

      <section className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4 text-sm text-sky-100">
        Use Chase prospect on a player card to send a quick YES/NO check. SIXFL will use SMS when a mobile number is saved, otherwise email.
      </section>

      <section className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Add manually</p>
          <h2 className="mt-2 text-xl font-semibold text-white">New prospect</h2>
          <form action={addProspectAction} className="mt-5 space-y-4">
            <input type="hidden" name="teamid" value={teamid} />
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-white/60">First name<input name="firstName" type="text" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60" /></label>
              <label className="space-y-2 text-sm text-white/60">Last name<input name="lastName" type="text" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60" /></label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-white/60">Email<input name="email" type="email" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60" /></label>
              <label className="space-y-2 text-sm text-white/60">Phone<input name="phone" type="text" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60" /></label>
            </div>
            <label className="space-y-2 text-sm text-white/60">Preferred positions<input name="preferredPositions" type="text" placeholder="Pivot, defender, winger" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60" /></label>
            <label className="space-y-2 text-sm text-white/60">Experience summary<textarea name="experienceSummary" rows={3} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white outline-none transition focus:border-emerald-500/60" /></label>
            <label className="space-y-2 text-sm text-white/60">Availability summary<textarea name="availabilitySummary" rows={3} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white outline-none transition focus:border-emerald-500/60" /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-white/60">Source<input name="source" type="text" placeholder="Join page, WhatsApp, referral" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60" /></label>
              <label className="space-y-2 text-sm text-white/60">Notes<input name="notes" type="text" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60" /></label>
            </div>
            <button type="submit" className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500">Add prospect</button>
          </form>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04]">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Pipeline</p><h2 className="mt-2 text-xl font-semibold text-white">Current prospects</h2></div>
          </div>
          <div className="divide-y divide-white/10">
            {typedProspects.length === 0 ? <div className="px-6 py-10 text-sm text-white/55">No prospects yet. Add one manually or use the public join page.</div> : null}
            {typedProspects.map((prospect) => {
              const preferredNights = getPreferredNightsDisplay(prospect.preferredNights);
              const prospectName = getProspectName({ firstName: prospect.firstName, lastName: prospect.lastName });
              const dispatches = dispatchMap.get(prospect.id) ?? [];
              const emailDispatches = dispatches.filter((dispatch) => dispatch.channel === NotificationChannel.EMAIL);
              const smsDispatches = dispatches.filter((dispatch) => dispatch.channel === NotificationChannel.SMS);
              const latestEmailDispatch = emailDispatches[0] ?? null;
              const latestSmsDispatch = smsDispatches[0] ?? null;
              const isFormComplete = hasCompletedProspectForm(prospect);
              const completionScore = countCompletedProfileFields(prospect);
              const savedEmail = prospect.email?.trim().toLowerCase() ?? "";
              const linkedUser = savedEmail ? linkedUserByEmail.get(savedEmail) ?? null : null;
              const promotionState = getPromotionState({ prospect, hasLinkedUser: Boolean(linkedUser), isExistingTeamMember: Boolean(linkedUser?.teamMembers.length) });
              const hasContact = Boolean(prospect.email?.trim() || prospect.phone?.trim());

              return (
                <div key={prospect.id} className="space-y-5 px-6 py-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-semibold text-white">{prospectName}</div>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getStatusClasses(prospect.status)}`}>{getStatusLabel(prospect.status)}</span>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getCompletionBadgeClasses(isFormComplete)}`}>{getCompletionLabel(prospect)}</span>
                      </div>
                      <div className="mt-2 text-sm text-white/65">{prospect.email || "No email"} {prospect.phone ? `· ${prospect.phone}` : ""}</div>
                      <div className="mt-1 text-xs text-white/45">{prospect.source || "No source"} · Added {formatUkDateTime(prospect.createdAt)}</div>
                      <div className="mt-2 text-xs text-white/50">{completionScore}/6 profile fields completed{prospect.lastContactedAt ? ` · Last contacted ${formatUkDateTime(prospect.lastContactedAt)}` : ""}</div>
                      {prospect.ageBand ? <div className="mt-2 text-sm text-white/70">Age band: {prospect.ageBand}</div> : null}
                      {prospect.preferredPositions ? <div className="mt-2 text-sm text-white/70">Position: {prospect.preferredPositions}</div> : null}
                      {prospect.experienceSummary ? <div className="mt-2 text-sm text-white/60">Experience: {prospect.experienceSummary}</div> : null}
                      {prospect.availabilityLevel ? <div className="mt-2 text-sm text-white/60">Availability level: {prospect.availabilityLevel}</div> : null}
                      {preferredNights ? <div className="mt-2 text-sm text-white/60">Preferred nights: {preferredNights}</div> : null}
                      {prospect.availabilitySummary ? <div className="mt-2 text-sm text-white/50">{prospect.availabilitySummary}</div> : null}
                    </div>
                    <form action={updateProspectStatusAction} className="flex flex-wrap items-center gap-3">
                      <input type="hidden" name="teamid" value={teamid} />
                      <input type="hidden" name="prospectId" value={prospect.id} />
                      <div className="min-w-[220px]"><FormListboxField name="status" value={prospect.status} options={STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))} placeholder="Select status" /></div>
                      <button type="submit" className="inline-flex items-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15">Update status</button>
                    </form>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[1.15fr_0.95fr_auto]">
                    <form action={updateProspectDetailsAction} className="space-y-4">
                      <input type="hidden" name="teamid" value={teamid} />
                      <input type="hidden" name="prospectId" value={prospect.id} />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="space-y-2 text-sm text-white/60">First name<input name="firstName" type="text" defaultValue={prospect.firstName} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60" /></label>
                        <label className="space-y-2 text-sm text-white/60">Last name<input name="lastName" type="text" defaultValue={prospect.lastName ?? ""} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60" /></label>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="space-y-2 text-sm text-white/60">Email<input name="email" type="email" defaultValue={prospect.email ?? ""} placeholder="Add email address" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60" /></label>
                        <label className="space-y-2 text-sm text-white/60">Phone<input name="phone" type="text" defaultValue={prospect.phone ?? ""} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60" /></label>
                      </div>
                      <button type="submit" className="inline-flex items-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15">Save details</button>
                    </form>

                    <form action={updateProspectNotesAction} className="space-y-3">
                      <input type="hidden" name="teamid" value={teamid} />
                      <input type="hidden" name="prospectId" value={prospect.id} />
                      <textarea name="notes" rows={6} defaultValue={prospect.notes ?? ""} placeholder="Internal notes" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none transition focus:border-emerald-500/60" />
                      <button type="submit" className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white">Save notes</button>
                    </form>

                    <div className="space-y-3 xl:self-start">
                      <ProspectInterestChaseCard teamid={teamid} prospectId={prospect.id} hasEmail={Boolean(prospect.email?.trim())} hasPhone={Boolean(prospect.phone?.trim())} />
                      <form action={sendProspectInterestChaseAction} className="space-y-2 rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.07] p-3">
                        <input type="hidden" name="teamid" value={teamid} />
                        <input type="hidden" name="prospectId" value={prospect.id} />
                        <button
                          type="submit"
                          disabled={!hasContact}
                          className={`inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition ${hasContact ? "border border-cyan-400/30 bg-cyan-500/15 text-cyan-50 hover:bg-cyan-500/20" : "cursor-not-allowed border border-white/10 bg-white/5 text-white/35"}`}
                        >
                          {hasContact ? "Chase prospect" : "Add phone or email first"}
                        </button>
                        {hasContact ? (
                          <p className="text-xs leading-5 text-white/50">
                            Sends a quick YES/NO chase by SMS when a mobile is saved, otherwise by email.
                          </p>
                        ) : null}
                      </form>
                      <div className={`rounded-2xl border px-4 py-3 text-sm ${getPromotionStateClasses(promotionState.tone)}`}>{promotionState.reason}</div>
                      <form action={convertProspectToMemberAction}>
                        <input type="hidden" name="teamid" value={teamid} />
                        <input type="hidden" name="prospectId" value={prospect.id} />
                        <button type="submit" disabled={!promotionState.canPromote} className={`inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium transition ${promotionState.canPromote ? "border border-emerald-400/30 bg-emerald-500/15 text-emerald-50 hover:bg-emerald-500/20" : "cursor-not-allowed border border-white/10 bg-white/5 text-white/35"}`}>Promote to squad</button>
                      </form>
                      {promotionState.showSignupCta ? <a href={joinUrl ?? absoluteJoinUrl} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white">{promotionState.signupLabel}</a> : null}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Communication history</p><p className="mt-1 text-sm text-white/65">Outbound activity is shown directly from this prospect’s email and SMS dispatch records.</p></div>
                      <div className="flex flex-wrap gap-2 text-xs text-white/55"><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Email: {emailDispatches.length} msg</span><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">SMS: {smsDispatches.length} msg</span></div>
                    </div>
                    <div className="mt-4 grid gap-4 xl:grid-cols-2">
                      {[
                        { title: "Email history", latest: latestEmailDispatch, items: emailDispatches },
                        { title: "SMS history", latest: latestSmsDispatch, items: smsDispatches },
                      ].map((group) => (
                        <div key={group.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                          <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-white">{group.title}</div><div className="mt-1 text-xs text-white/45">{group.latest ? `Latest ${group.latest.status.toLowerCase()} ${getDispatchTimeLabel(group.latest)}` : "No messages yet"}</div></div>{group.latest ? <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getDispatchStatusClasses(group.latest.status)}`}>{group.latest.status}</span> : null}</div>
                          {group.items.length > 0 ? <div className="mt-4 space-y-3">{group.items.slice(0, 5).map((dispatch) => <div key={dispatch.id} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white/80"><div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.14em] text-white/45"><span>{dispatch.channel}</span><span>{getDispatchTimeLabel(dispatch)}</span></div><div className="mt-2 flex items-center gap-2"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${getDispatchStatusClasses(dispatch.status)}`}>{dispatch.status}</span>{dispatch.subject ? <span className="truncate text-xs text-white/50">{dispatch.subject}</span> : null}</div><div className="mt-2 whitespace-pre-wrap break-words leading-6">{dispatch.bodyText}</div>{dispatch.failureReason ? <div className="mt-2 text-xs text-red-200/80">{dispatch.failureReason}</div> : null}</div>)}</div> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
