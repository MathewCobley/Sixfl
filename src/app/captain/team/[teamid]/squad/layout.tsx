// ========================================
// File: src/app/captain/team/[teamid]/squad/layout.tsx
// ========================================

import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NotificationDispatchStatus } from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import WhatsAppSquadBadges from "./WhatsAppSquadBadges";

type CaptainSquadLayoutProps = {
  children: ReactNode;
  params: Promise<{ teamid: string }>;
};

type PendingProspect = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  updatedAt: Date;
};

type ActivationDispatchSnapshot = {
  sourceId: string | null;
  status: NotificationDispatchStatus;
  createdAt: Date;
  scheduledFor: Date;
  sentAt: Date | null;
  failedAt: Date | null;
};

function getDisplayName(prospect: PendingProspect) {
  return [prospect.firstName, prospect.lastName].filter(Boolean).join(" ").trim() ||
    prospect.email ||
    prospect.phone ||
    "Unnamed player";
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

function getDispatchStatusText(input: {
  label: string;
  dispatch?: ActivationDispatchSnapshot | null;
}) {
  const dispatch = input.dispatch;

  if (!dispatch) {
    return `${input.label} not sent yet.`;
  }

  switch (dispatch.status) {
    case "SENT":
      return `${input.label} sent ${formatUkDateTime(dispatch.sentAt ?? dispatch.createdAt)}.`;
    case "QUEUED":
      return `${input.label} queued ${formatUkDateTime(dispatch.scheduledFor ?? dispatch.createdAt)}.`;
    case "PROCESSING":
      return `${input.label} processing ${formatUkDateTime(dispatch.createdAt)}.`;
    case "FAILED":
      return `${input.label} failed ${formatUkDateTime(dispatch.failedAt ?? dispatch.createdAt)}.`;
    case "SKIPPED":
      return `${input.label} skipped ${formatUkDateTime(dispatch.createdAt)}.`;
    case "CANCELLED":
      return `${input.label} cancelled ${formatUkDateTime(dispatch.createdAt)}.`;
    default:
      return `${input.label} queued ${formatUkDateTime(dispatch.createdAt)}.`;
  }
}

function getStatusClasses(dispatch?: ActivationDispatchSnapshot | null) {
  if (!dispatch) return "border-white/10 bg-white/[0.04] text-white/55";

  if (dispatch.status === "SENT") {
    return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
  }

  if (["FAILED", "SKIPPED", "CANCELLED"].includes(dispatch.status)) {
    return "border-red-400/20 bg-red-500/10 text-red-100";
  }

  return "border-sky-400/20 bg-sky-500/10 text-sky-100";
}

function ActivationForm({
  teamid,
  prospectId,
  action,
  disabled,
  children,
  tone = "emerald",
}: {
  teamid: string;
  prospectId: string;
  action: "send-activation" | "send-activation-sms";
  disabled?: boolean;
  children: ReactNode;
  tone?: "emerald" | "sky";
}) {
  const toneClass =
    tone === "sky"
      ? "border-sky-400/25 bg-sky-500/10 text-sky-100 hover:bg-sky-500/15"
      : "border-emerald-400/25 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15";

  return (
    <form method="post" action={`/captain/team/${teamid}/squad/${action}`}>
      <input type="hidden" name="prospectId" value={prospectId} />
      <button
        type="submit"
        disabled={disabled}
        className={`inline-flex h-10 items-center justify-center rounded-xl border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.04] disabled:text-white/35 ${toneClass}`}
      >
        {children}
      </button>
    </form>
  );
}

async function getPendingProspects(teamid: string) {
  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      name: true,
      members: {
        select: {
          user: {
            select: {
              email: true,
            },
          },
        },
      },
      prospects: {
        where: {
          status: "ACTIVE_SQUAD",
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!team) {
    return { team: null, pendingProspects: [] as PendingProspect[] };
  }

  const linkedMemberEmails = new Set(
    team.members
      .map((member) => member.user.email?.trim().toLowerCase() ?? null)
      .filter((email): email is string => Boolean(email)),
  );

  const pendingProspects = team.prospects.filter((prospect) => {
    const email = prospect.email?.trim().toLowerCase() ?? null;
    return !email || !linkedMemberEmails.has(email);
  });

  return { team, pendingProspects };
}

function mapLatestDispatchByProspectId(dispatches: ActivationDispatchSnapshot[]) {
  const map = new Map<string, ActivationDispatchSnapshot>();

  for (const dispatch of dispatches) {
    if (dispatch.sourceId && !map.has(dispatch.sourceId)) {
      map.set(dispatch.sourceId, dispatch);
    }
  }

  return map;
}

async function getLatestActivationDispatches(prospectIds: string[]) {
  if (prospectIds.length === 0) {
    return {
      emailByProspectId: new Map<string, ActivationDispatchSnapshot>(),
      smsByProspectId: new Map<string, ActivationDispatchSnapshot>(),
    };
  }

  const [emailDispatches, smsDispatches] = await Promise.all([
    prisma.notificationDispatch.findMany({
      where: {
        sourceType: "TEAM_PLAYER_PROSPECT",
        sourceId: { in: prospectIds },
        template: { is: { key: "squad-activation-email" } },
      },
      select: {
        sourceId: true,
        status: true,
        createdAt: true,
        scheduledFor: true,
        sentAt: true,
        failedAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.notificationDispatch.findMany({
      where: {
        sourceType: "TEAM_PLAYER_PROSPECT",
        sourceId: { in: prospectIds },
        template: { is: { key: "squad-activation-sms" } },
      },
      select: {
        sourceId: true,
        status: true,
        createdAt: true,
        scheduledFor: true,
        sentAt: true,
        failedAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    emailByProspectId: mapLatestDispatchByProspectId(emailDispatches),
    smsByProspectId: mapLatestDispatchByProspectId(smsDispatches),
  };
}

async function ActivationQuickSendPanel({ teamid }: { teamid: string }) {
  const { team, pendingProspects } = await getPendingProspects(teamid);

  if (!team || pendingProspects.length === 0) {
    return null;
  }

  const { emailByProspectId, smsByProspectId } = await getLatestActivationDispatches(
    pendingProspects.map((prospect) => prospect.id),
  );

  return (
    <section className="rounded-3xl border border-amber-400/20 bg-amber-500/[0.07] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.28)] sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-100/70">
            Activation quick send
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Send account activation links
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-100/80">
            These promoted squad players do not yet have a linked SIXFL account.
            Send them an activation email, or send an SMS activation chase if a
            phone number is saved.
          </p>
        </div>
        <Link
          href="#pending-activation"
          className="inline-flex w-fit items-center justify-center rounded-xl border border-white/10 bg-black/25 px-4 py-2.5 text-sm font-medium text-white/75 transition hover:bg-white/10 hover:text-white"
        >
          Jump to pending list
        </Link>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-2">
        {pendingProspects.map((prospect) => {
          const displayName = getDisplayName(prospect);
          const emailDispatch = emailByProspectId.get(prospect.id) ?? null;
          const smsDispatch = smsByProspectId.get(prospect.id) ?? null;
          const hasEmail = Boolean(prospect.email?.trim());
          const hasPhone = Boolean(prospect.phone?.trim());

          return (
            <article
              key={prospect.id}
              className="rounded-2xl border border-white/10 bg-black/25 p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-white">{displayName}</h3>
                  <p className="mt-1 text-sm text-white/60">
                    {prospect.email || "No email saved"}
                    {prospect.phone ? ` · ${prospect.phone}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-white/40">
                    Promoted {formatUkDateTime(prospect.updatedAt)}
                  </p>
                </div>
                <span className="w-fit rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-100">
                  Pending account
                </span>
              </div>

              <div className="mt-4 grid gap-2">
                <div className={`rounded-xl border px-3 py-2 text-xs ${getStatusClasses(emailDispatch)}`}>
                  {getDispatchStatusText({ label: "Activation email", dispatch: emailDispatch })}
                </div>
                <div className={`rounded-xl border px-3 py-2 text-xs ${getStatusClasses(smsDispatch)}`}>
                  {getDispatchStatusText({ label: "Activation SMS", dispatch: smsDispatch })}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <ActivationForm
                  teamid={teamid}
                  prospectId={prospect.id}
                  action="send-activation"
                  disabled={!hasEmail}
                >
                  {emailDispatch ? "Resend activation email" : "Send activation email"}
                </ActivationForm>
                <ActivationForm
                  teamid={teamid}
                  prospectId={prospect.id}
                  action="send-activation-sms"
                  disabled={!hasPhone}
                  tone="sky"
                >
                  {smsDispatch ? "Resend activation SMS" : "Send activation SMS"}
                </ActivationForm>
                <Link
                  href={`/admin/teams/${teamid}/prospects/${prospect.id}/communications`}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-white/75 transition hover:bg-white/10 hover:text-white"
                >
                  Prospect comms
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default async function CaptainSquadLayout({
  children,
  params,
}: CaptainSquadLayoutProps) {
  const { teamid } = await params;
  const access = await requireCaptain(teamid);

  if (!access.isAdmin) {
    redirect(`/captain/team/${teamid}/captain-squad`);
  }

  const whatsappEntries = await prisma.$queryRaw<
    Array<{ id: string; name: string | null; email: string | null }>
  >`
    SELECT u.id, u.name, u.email
    FROM "TeamMember" tm
    INNER JOIN "User" u ON u.id = tm."userId"
    WHERE tm."teamId" = ${teamid}
      AND u."usesWhatsapp" = true
  `;

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="rounded-[1.5rem] border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100 shadow-[0_18px_60px_rgba(0,0,0,0.25)] sm:rounded-3xl sm:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-100/70">
              Admin-only managed squad tools
            </p>
            <h2 className="mt-2 text-lg font-semibold text-white">Powerful squad management view</h2>
            <p className="mt-1 max-w-3xl text-amber-100/75">
              This route is kept for SIXFL admin use only. Appointed captains are redirected to the safer captain squad view.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href={`/captain/team/${teamid}/captain-squad`}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-center text-sm font-medium text-white/80 transition hover:bg-white/5 hover:text-white sm:w-auto"
            >
              View weaker captain version
            </Link>
            <Link
              href={`/admin/teams/${teamid}/squad`}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-2.5 text-center text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/20 sm:w-auto"
            >
              Open admin squad console
            </Link>
          </div>
        </div>
      </section>
      <ActivationQuickSendPanel teamid={teamid} />
      {children}
      <WhatsAppSquadBadges entries={whatsappEntries} />
    </div>
  );
}
