// ========================================
// File: src/app/(admin)/admin/teams/[id]/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  NotificationChannel,
  NotificationDispatchStatus,
  UserRole,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import {
  deleteTeamAction,
  regenerateClaimCodeAction,
  sendTeamMessageAction,
  updateTeamDetailsAction,
} from "../actions";
import ConfirmDeleteButton from "@/components/admin/ConfirmDeleteButton";
import CopyToClipboardButton from "@/components/admin/CopyToClipboardButton";
import TeamBadge from "@/components/admin/TeamBadge";

function formatDispatchStatus(status: NotificationDispatchStatus) {
  switch (status) {
    case "QUEUED":
      return "Queued";
    case "PROCESSING":
      return "Processing";
    case "SENT":
      return "Sent";
    case "FAILED":
      return "Failed";
    case "CANCELLED":
      return "Cancelled";
    case "SKIPPED":
      return "Skipped";
    default:
      return status;
  }
}

function formatChannel(channel: NotificationChannel) {
  return channel === "SMS" ? "SMS" : "Email";
}

function getDispatchOriginLabel(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "Sent to team";
  }

  const value = (metadata as Record<string, unknown>).originLabel;

  if (typeof value === "string" && value.trim()) {
    return value;
  }

  return "Sent to team";
}

type TeamMessageHistoryItem = {
  id: string;
  kind: "dispatch" | "legacyLeadEmail";
  channel: NotificationChannel;
  statusLabel: string;
  originLabel: string;
  subject: string;
  bodyText: string;
  recipientLabel: string;
  recipientValue: string;
  queuedAt: Date;
  sentAt: Date | null;
  failureReason: string | null;
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    error?: string;
    regenerated?: string;
    saved?: string;
    deleted?: string;
    messageQueued?: string;
    channel?: string;
    composeError?: string;
  }>;
};

export default async function AdminTeamPage({
  params,
  searchParams,
}: Props) {
  await requireAdmin();

  const { id } = await params;
  const sp = (await searchParams) ?? {};

  if (!id) {
    notFound();
  }

  const [team, leagues] = await Promise.all([
    prisma.team.findUnique({
      where: { id },
      include: {
        members: {
          where: { role: "MANAGER" },
          include: {
            user: {
              select: {
                email: true,
                name: true,
                role: true,
              },
            },
          },
        },
        league: {
          select: {
            id: true,
            name: true,
            season: true,
            slug: true,
          },
        },
        convertedFromLead: {
          select: {
            id: true,
            contactName: true,
            email: true,
            phone: true,
            area: true,
            emails: {
              orderBy: {
                sentAt: "desc",
              },
              select: {
                id: true,
                subject: true,
                body: true,
                sentTo: true,
                sentAt: true,
              },
            },
          },
        },
        createdByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    }),
    prisma.league.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }, { season: "asc" }],
      select: {
        id: true,
        name: true,
        season: true,
        isActive: true,
      },
    }),
  ]);

  if (!team) {
    notFound();
  }

  const { snapshot: contactSnapshot, recipient } =
    await upsertTeamNotificationRecipient(id);

  const dispatches = await prisma.notificationDispatch.findMany({
    where: {
      OR: [
        {
          sourceType: "TEAM",
          sourceId: id,
        },
        {
          recipientId: recipient.id,
        },
      ],
    },
    include: {
      recipient: true,
      attempts: {
        orderBy: {
          attemptedAt: "desc",
        },
        take: 3,
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
  });

  const legacyLeadEmails = team.convertedFromLead?.emails ?? [];

  const historyItems: TeamMessageHistoryItem[] = [
    ...dispatches.map((dispatch) => ({
      id: `dispatch-${dispatch.id}`,
      kind: "dispatch" as const,
      channel: dispatch.channel,
      statusLabel: formatDispatchStatus(dispatch.status),
      originLabel: getDispatchOriginLabel(dispatch.metadata),
      subject:
        dispatch.subject?.trim() ||
        (dispatch.channel === NotificationChannel.SMS
          ? "SMS message"
          : "Email"),
      bodyText: dispatch.bodyText,
      recipientLabel: dispatch.recipient.displayName || team.name,
      recipientValue:
        dispatch.channel === NotificationChannel.SMS
          ? dispatch.recipient.phone || "No phone"
          : dispatch.recipient.email || "No email",
      queuedAt: dispatch.createdAt,
      sentAt: dispatch.sentAt,
      failureReason: dispatch.failureReason,
    })),
    ...legacyLeadEmails.map((email) => ({
      id: `lead-email-${email.id}`,
      kind: "legacyLeadEmail" as const,
      channel: NotificationChannel.EMAIL,
      statusLabel: "Sent",
      originLabel: "Converted lead history",
      subject: email.subject?.trim() || "Email",
      bodyText: email.body,
      recipientLabel: team.convertedFromLead?.contactName || team.name,
      recipientValue: email.sentTo,
      queuedAt: email.sentAt,
      sentAt: email.sentAt,
      failureReason: null,
    })),
  ].sort((a, b) => {
    const aTime = (a.sentAt ?? a.queuedAt).getTime();
    const bTime = (b.sentAt ?? b.queuedAt).getTime();
    return bTime - aTime;
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const claimLink = `${baseUrl}/claim?code=${encodeURIComponent(team.claimCode)}`;

  const managerUser = team.members[0]?.user;
  const hasManager = Boolean(managerUser?.email);
  const claimedByCaptain = hasManager && managerUser?.role !== UserRole.ADMIN;

  const queuedMessage = sp.messageQueued === "1";
  const queuedChannel = sp.channel === "sms" ? "SMS" : "Email";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Link
            href="/admin/teams"
            className="text-sm text-emerald-300 hover:text-emerald-200"
          >
            ← Back to teams
          </Link>

          <h1 className="text-3xl font-semibold text-white">{team.name}</h1>

          <p className="text-sm text-white/60">
            Admin view for this team. Manage league assignment, branding,
            captain claim status, team access, fixture timing preferences, team
            contacts, and email/SMS history.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {team.league ? (
            <Link
              href={`/admin/leagues/${team.league.id}`}
              className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
            >
              Open league
            </Link>
          ) : null}

          <Link
            href="/admin/teams"
            className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
          >
            All teams
          </Link>
        </div>
      </div>

      {(sp.saved === "1" ||
        sp.regenerated === "1" ||
        sp.error ||
        queuedMessage ||
        sp.composeError) && (
        <div className="space-y-2 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm">
          {sp.saved === "1" ? (
            <div className="text-emerald-300">Team details updated.</div>
          ) : null}

          {sp.regenerated === "1" ? (
            <div className="text-emerald-300">
              New claim code generated and the team was unclaimed.
            </div>
          ) : null}

          {queuedMessage ? (
            <div className="text-emerald-300">
              {queuedChannel} queued for this team.
            </div>
          ) : null}

          {sp.error === "has_fixtures" ? (
            <div className="text-red-300">
              Can’t delete this team because fixtures already exist for it.
            </div>
          ) : null}

          {sp.error === "missing_name" ? (
            <div className="text-red-300">Team name is required.</div>
          ) : null}

          {sp.composeError === "missing_subject" ? (
            <div className="text-red-300">Email subject is required.</div>
          ) : null}

          {sp.composeError === "missing_body" ? (
            <div className="text-red-300">Message body is required.</div>
          ) : null}

          {sp.composeError === "missing_email" ? (
            <div className="text-red-300">
              No primary team email is available yet.
            </div>
          ) : null}

          {sp.composeError === "missing_phone" ? (
            <div className="text-red-300">
              No primary team mobile number is available yet.
            </div>
          ) : null}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <TeamBadge name={team.name} logoUrl={team.logoUrl} size="lg" />

              <div className="space-y-1">
                <div>
                  <div className="text-sm text-white/60">Team name</div>
                  <div className="text-lg text-white">{team.name}</div>
                </div>

                <div className="text-sm text-white/60">
                  {team.league
                    ? `${team.league.name}${
                        team.league.season ? ` — ${team.league.season}` : ""
                      }`
                    : "No league assigned"}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
            <h2 className="mb-6 text-lg font-semibold text-white">
              Team settings
            </h2>

            <form action={updateTeamDetailsAction} className="space-y-5">
              <input type="hidden" name="id" value={team.id} />

              <div className="space-y-2">
                <label htmlFor="name" className="text-sm text-white/60">
                  Team name
                </label>

                <input
                  id="name"
                  name="name"
                  type="text"
                  defaultValue={team.name}
                  placeholder="Enter team name"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
                />

                <div className="text-xs text-white/50">
                  This updates the public team name, admin listings, and team
                  messaging label.
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="leagueId" className="text-sm text-white/60">
                  League
                </label>

                <select
                  id="leagueId"
                  name="leagueId"
                  defaultValue={team.leagueId ?? ""}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60"
                >
                  <option value="">No league</option>
                  {leagues.map((league) => (
                    <option key={league.id} value={league.id}>
                      {league.name}
                      {league.season ? ` — ${league.season}` : ""}
                      {league.isActive ? "" : " (inactive)"}
                    </option>
                  ))}
                </select>

                <div className="text-xs text-white/50">
                  Current:{" "}
                  {team.league
                    ? `${team.league.name}${
                        team.league.season ? ` — ${team.league.season}` : ""
                      }`
                    : "No league assigned"}
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="logoUrl" className="text-sm text-white/60">
                  Logo URL
                </label>

                <input
                  id="logoUrl"
                  name="logoUrl"
                  type="text"
                  defaultValue={team.logoUrl ?? ""}
                  placeholder="/team-logos/ripon-rovers.png"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
                />

                <div className="text-xs text-white/50">
                  Use a path from{" "}
                  <span className="font-mono text-white/70">
                    public/team-logos
                  </span>
                  , for example{" "}
                  <span className="font-mono text-white/70">
                    /team-logos/ripon-rovers.png
                  </span>
                </div>

                <div className="text-xs text-white/50">
                  Current:{" "}
                  <span className="font-mono text-white/70">
                    {team.logoUrl || "No logo set"}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="latestKickoffTime"
                  className="text-sm text-white/60"
                >
                  Latest kickoff time
                </label>

                <input
                  id="latestKickoffTime"
                  name="latestKickoffTime"
                  type="time"
                  defaultValue={team.latestKickoffTime ?? ""}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60"
                />

                <div className="text-xs text-white/50">
                  Leave blank if this team can play any slot. Generated fixtures
                  will avoid kick-off times later than this.
                </div>

                <div className="text-xs text-white/50">
                  Current:{" "}
                  <span className="font-mono text-white/70">
                    {team.latestKickoffTime || "No restriction"}
                  </span>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="contactName" className="text-sm text-white/60">
                    Primary contact name
                  </label>
                  <input
                    id="contactName"
                    name="contactName"
                    type="text"
                    defaultValue={
                      team.contactName ?? contactSnapshot.primaryContact.name ?? ""
                    }
                    placeholder="John Smith"
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="contactEmail" className="text-sm text-white/60">
                    Primary contact email
                  </label>
                  <input
                    id="contactEmail"
                    name="contactEmail"
                    type="email"
                    defaultValue={
                      team.contactEmail ?? contactSnapshot.primaryContact.email ?? ""
                    }
                    placeholder="captain@team.com"
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="contactPhone" className="text-sm text-white/60">
                    Primary contact mobile
                  </label>
                  <input
                    id="contactPhone"
                    name="contactPhone"
                    type="text"
                    defaultValue={
                      team.contactPhone ?? contactSnapshot.primaryContact.phone ?? ""
                    }
                    placeholder="07700 900123"
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="secondaryContactName"
                    className="text-sm text-white/60"
                  >
                    Secondary contact name
                  </label>
                  <input
                    id="secondaryContactName"
                    name="secondaryContactName"
                    type="text"
                    defaultValue={team.secondaryContactName ?? ""}
                    placeholder="Assistant manager"
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="secondaryContactEmail"
                    className="text-sm text-white/60"
                  >
                    Secondary contact email
                  </label>
                  <input
                    id="secondaryContactEmail"
                    name="secondaryContactEmail"
                    type="email"
                    defaultValue={team.secondaryContactEmail ?? ""}
                    placeholder="assistant@team.com"
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="secondaryContactPhone"
                    className="text-sm text-white/60"
                  >
                    Secondary contact mobile
                  </label>
                  <input
                    id="secondaryContactPhone"
                    name="secondaryContactPhone"
                    type="text"
                    defaultValue={team.secondaryContactPhone ?? ""}
                    placeholder="07700 900456"
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
              >
                Save team details
              </button>
            </form>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Team contacts
                </h2>
                <p className="mt-1 text-sm text-white/60">
                  All known contact points for this team, including email
                  addresses and mobile numbers.
                </p>
              </div>

              <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-medium text-white/70">
                {contactSnapshot.contacts.length} contact
                {contactSnapshot.contacts.length === 1 ? "" : "s"}
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200/90">
                  Primary contact
                </div>
                <div className="mt-3 space-y-2 text-sm text-white/80">
                  <div>
                    <span className="text-white/45">Name:</span>{" "}
                    {contactSnapshot.primaryContact.name ?? "—"}
                  </div>
                  <div>
                    <span className="text-white/45">Email:</span>{" "}
                    {contactSnapshot.primaryContact.email ?? "—"}
                  </div>
                  <div>
                    <span className="text-white/45">Phone:</span>{" "}
                    {contactSnapshot.primaryContact.phone ?? "—"}
                  </div>
                  <div>
                    <span className="text-white/45">Source:</span>{" "}
                    {contactSnapshot.primaryContact.source ?? "—"}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
                  Lead / origin details
                </div>
                <div className="mt-3 space-y-2 text-sm text-white/80">
                  <div>
                    <span className="text-white/45">Converted from lead:</span>{" "}
                    {team.convertedFromLead ? "Yes" : "No"}
                  </div>
                  <div>
                    <span className="text-white/45">Lead name:</span>{" "}
                    {team.convertedFromLead?.contactName ?? "—"}
                  </div>
                  <div>
                    <span className="text-white/45">Lead email:</span>{" "}
                    {team.convertedFromLead?.email ?? "—"}
                  </div>
                  <div>
                    <span className="text-white/45">Lead phone:</span>{" "}
                    {team.convertedFromLead?.phone ?? "—"}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
              <div className="divide-y divide-white/10">
                {contactSnapshot.contacts.length === 0 ? (
                  <div className="bg-black/20 px-4 py-5 text-sm text-white/55">
                    No team contact details are available yet.
                  </div>
                ) : (
                  contactSnapshot.contacts.map((contact) => (
                    <div
                      key={contact.key}
                      className="grid gap-3 bg-black/20 px-4 py-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-center"
                    >
                      <div>
                        <div className="text-sm font-medium text-white">
                          {contact.name ?? "Unnamed contact"}
                        </div>
                        <div className="mt-1 text-xs text-white/45">
                          {contact.label} · {contact.source}
                        </div>
                      </div>

                      <div className="text-sm text-white/80">
                        {contact.email ?? "—"}
                      </div>

                      <div className="text-sm text-white/80">
                        {contact.phone ?? "—"}
                      </div>

                      <div>
                        {contact.isPrimary ? (
                          <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] text-emerald-200">
                            Primary
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Team message history
                </h2>
                <p className="mt-1 text-sm text-white/60">
                  Everything sent to this team from team level or league level,
                  plus any legacy email history from the converted lead,
                  appears here.
                </p>
              </div>

              <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-medium text-white/70">
                {historyItems.length} item{historyItems.length === 1 ? "" : "s"}
              </div>
            </div>

            <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
              <div className="divide-y divide-white/10">
                {historyItems.length === 0 ? (
                  <div className="bg-black/20 px-4 py-5 text-sm text-white/55">
                    No team, league, or converted lead email/SMS history for
                    this team yet.
                  </div>
                ) : (
                  historyItems.map((item) => (
                    <div key={item.id} className="space-y-3 bg-black/20 px-4 py-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">
                              {formatChannel(item.channel)}
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">
                              {item.statusLabel}
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/55">
                              {item.originLabel}
                            </span>
                          </div>

                          <div className="mt-3 text-sm font-semibold text-white">
                            {item.subject}
                          </div>

                          <div className="mt-1 text-xs text-white/45">
                            To: {item.recipientLabel} · {item.recipientValue}
                          </div>
                        </div>

                        <div className="text-right text-xs text-white/45">
                          {item.kind === "legacyLeadEmail" ? (
                            <div>Sent: {item.sentAt?.toLocaleString()}</div>
                          ) : (
                            <>
                              <div>Queued: {item.queuedAt.toLocaleString()}</div>
                              {item.sentAt ? (
                                <div>Sent: {item.sentAt.toLocaleString()}</div>
                              ) : null}
                            </>
                          )}
                        </div>
                      </div>

                      <div className="whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-white/80">
                        {item.bodyText}
                      </div>

                      {item.failureReason ? (
                        <div className="text-xs text-red-300">
                          Failure: {item.failureReason}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">Team snapshot</h2>

            <div className="mt-4 space-y-4 text-sm text-white/70">
              <div className="flex items-center justify-between">
                <span>League</span>
                <span className="text-right font-medium text-white">
                  {team.league
                    ? `${team.league.name}${
                        team.league.season ? ` — ${team.league.season}` : ""
                      }`
                    : "—"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span>Latest kickoff</span>
                <span className="text-right font-medium text-white">
                  {team.latestKickoffTime ?? "—"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span>Captain status</span>
                <span className="font-medium text-white">
                  {!hasManager
                    ? "Unclaimed"
                    : claimedByCaptain
                      ? "Claimed"
                      : "Managed by admin"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span>Primary email</span>
                <span className="text-right font-medium text-white">
                  {contactSnapshot.primaryContact.email ?? "—"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span>Primary phone</span>
                <span className="text-right font-medium text-white">
                  {contactSnapshot.primaryContact.phone ?? "—"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span>Team ID</span>
                <span className="font-mono text-xs text-white">{team.id}</span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">Send email</h2>

            <form action={sendTeamMessageAction} className="mt-4 space-y-4">
              <input type="hidden" name="teamId" value={team.id} />
              <input type="hidden" name="from" value={`/admin/teams/${team.id}`} />
              <input type="hidden" name="channel" value="EMAIL" />

              <div>
                <label className="mb-1 block text-sm text-white/70">To</label>
                <input
                  value={contactSnapshot.primaryContact.email ?? ""}
                  disabled
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white/50"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-white/70">
                  Subject
                </label>
                <input
                  name="subject"
                  placeholder="League update for your team"
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white outline-none focus:border-emerald-400"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-white/70">
                  Message
                </label>
                <textarea
                  name="body"
                  rows={9}
                  className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-emerald-400"
                  placeholder={`Hi ${
                    contactSnapshot.primaryContact.name || team.name
                  },\n\nWe wanted to update you about your team.\n\nThanks,\nSIXFL`}
                />
              </div>

              <button
                type="submit"
                className="rounded-xl bg-emerald-500 px-4 py-2 font-medium text-black transition hover:bg-emerald-400"
              >
                Queue email
              </button>
            </form>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">Send SMS</h2>

            <form action={sendTeamMessageAction} className="mt-4 space-y-4">
              <input type="hidden" name="teamId" value={team.id} />
              <input type="hidden" name="from" value={`/admin/teams/${team.id}`} />
              <input type="hidden" name="channel" value="SMS" />

              <div>
                <label className="mb-1 block text-sm text-white/70">
                  Mobile
                </label>
                <input
                  value={contactSnapshot.primaryContact.phone ?? ""}
                  disabled
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white/50"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-white/70">
                  Message
                </label>
                <textarea
                  name="body"
                  rows={6}
                  className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-emerald-400"
                  placeholder="SIXFL: quick update for your team. Please check your email or reply if you need anything."
                />
              </div>

              <button
                type="submit"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 font-medium text-white transition hover:bg-white/10"
              >
                Queue SMS
              </button>
            </form>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">Captain access</h2>

            <div className="mt-4 space-y-4">
              <div>
                <div className="text-sm text-white/60">Claim code</div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="font-mono text-sm text-white/80">
                    {team.claimCode}
                  </div>
                  <CopyToClipboardButton
                    text={team.claimCode}
                    label="Copy code"
                    className="rounded-md border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
                  />
                </div>
              </div>

              <div>
                <div className="text-sm text-white/60">Claim link</div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <a
                    href={claimLink}
                    className="break-all text-sm text-emerald-400 underline underline-offset-4 hover:text-emerald-300"
                  >
                    {claimLink}
                  </a>
                  <CopyToClipboardButton
                    text={claimLink}
                    label="Copy link"
                    className="rounded-md border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-yellow-500/30 bg-yellow-500/5 p-6">
            <h2 className="text-lg font-semibold text-yellow-200">
              Regenerate captain code
            </h2>

            <p className="mt-2 text-sm text-white/60">
              Regenerating the claim code invalidates the old link and unclaims
              the team by removing the current manager assignment.
            </p>

            <form action={regenerateClaimCodeAction} className="mt-5">
              <input type="hidden" name="id" value={team.id} />
              <input
                type="hidden"
                name="from"
                value={`/admin/teams/${team.id}`}
              />
              <ConfirmDeleteButton
                label="Regenerate claim code"
                confirmText={`Regenerate claim code for "${team.name}" and unclaim the team?`}
                className="rounded-md bg-yellow-600 px-4 py-2 text-black hover:bg-yellow-500"
              />
            </form>
          </div>

          <div className="rounded-3xl border border-red-500/30 bg-red-500/5 p-6">
            <h2 className="text-lg font-semibold text-red-400">Danger zone</h2>

            <p className="mt-2 text-sm text-white/60">
              Deleting a team cannot be undone.
            </p>

            <form action={deleteTeamAction} className="mt-5">
              <input type="hidden" name="id" value={team.id} />
              <input
                type="hidden"
                name="from"
                value={`/admin/teams/${team.id}`}
              />
              <ConfirmDeleteButton
                label="Delete team"
                confirmText={`Delete "${team.name}"? This cannot be undone.`}
                className="rounded-md bg-red-600 px-4 py-2 text-white hover:bg-red-500"
              />
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}