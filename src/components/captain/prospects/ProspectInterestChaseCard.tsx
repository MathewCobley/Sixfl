// ========================================
// File: src/components/captain/prospects/ProspectInterestChaseCard.tsx
// ========================================

import {
  NotificationChannel,
  NotificationDispatchStatus,
  Prisma,
} from "@prisma/client";

import { convertProspectToMemberAction } from "@/app/captain/team/[teamid]/prospects/actions";
import { sendProspectInterestChaseAction } from "@/app/captain/team/[teamid]/prospects/chase-actions";
import {
  sendProspectSquadActivationAction,
  sendProspectSquadActivationReminderAction,
} from "@/app/captain/team/[teamid]/prospects/workflow-actions";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";

type ProspectInterestChaseCardProps = {
  teamid: string;
  prospectId: string;
  hasEmail: boolean;
  hasPhone: boolean;
};

type PlayerInterestResponseRow = {
  id: string;
  response: string;
  respondedAt: Date;
};

const ACTIVATION_SOURCE_TYPES = [
  "MANAGED_SQUAD_JOIN_CONFIRMATION",
  "MANAGED_SQUAD_JOIN_CHASE",
  "MANAGED_SQUAD_JOIN_FINAL_CHASE",
] as const;

const FOLLOW_UP_DELAY_MS = 48 * 60 * 60 * 1000;

function formatDateTime(value: Date | null | undefined) {
  if (!value) return null;
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDispatchStatusClasses(status?: NotificationDispatchStatus | null) {
  switch (status) {
    case "SENT":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "QUEUED":
    case "PROCESSING":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    case "FAILED":
    case "CANCELLED":
      return "border-red-400/25 bg-red-500/10 text-red-100";
    default:
      return "border-white/10 bg-white/[0.04] text-white/60";
  }
}

function getResponseClasses(response?: string | null) {
  if (response === "YES") {
    return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
  }
  if (response === "NO") {
    return "border-red-400/25 bg-red-500/10 text-red-100";
  }
  return "border-white/10 bg-white/[0.04] text-white/60";
}

function getResponseLabel(response?: string | null) {
  if (response === "YES") return "YES — still interested";
  if (response === "NO") return "NO — follow up / remove";
  return "No YES/NO reply yet";
}

function isYesNoChaseDispatch(input: {
  sourceType: string | null;
  subject: string | null;
  bodyText: string;
}) {
  return (
    input.sourceType === "TEAM_PLAYER_PROSPECT" &&
    (input.subject?.toLowerCase().includes("still interested in playing") ||
      input.bodyText.toLowerCase().includes("are you still interested in playing for"))
  );
}

function isUsableDispatchStatus(status: NotificationDispatchStatus) {
  return ["QUEUED", "PROCESSING", "SENT"].includes(status);
}

export default async function ProspectInterestChaseCard({
  teamid,
  prospectId,
  hasEmail,
  hasPhone,
}: ProspectInterestChaseCardProps) {
  const [prospect, dispatches, responses] = await Promise.all([
    prisma.teamPlayerProspect.findFirst({
      where: {
        id: prospectId,
        teamId: teamid,
      },
      select: {
        id: true,
        status: true,
        email: true,
        phone: true,
      },
    }),
    prisma.notificationDispatch.findMany({
      where: {
        sourceId: prospectId,
        sourceType: {
          in: ["TEAM_PLAYER_PROSPECT", ...ACTIVATION_SOURCE_TYPES],
        },
        channel: { in: [NotificationChannel.EMAIL, NotificationChannel.SMS] },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 20,
      select: {
        id: true,
        sourceType: true,
        channel: true,
        status: true,
        subject: true,
        bodyText: true,
        createdAt: true,
        sentAt: true,
        failedAt: true,
      },
    }),
    prisma
      .$queryRaw<PlayerInterestResponseRow[]>(Prisma.sql`
        SELECT "id", "response", "respondedAt"
        FROM "PlayerInterestResponse"
        WHERE "teamId" = ${teamid}
          AND "prospectId" = ${prospectId}
        ORDER BY "respondedAt" DESC
        LIMIT 1
      `)
      .catch(() => []),
  ]);

  if (!prospect) return null;

  const latestResponse = responses[0] ?? null;
  const latestChase = dispatches.find(isYesNoChaseDispatch) ?? null;
  const initialInvite = dispatches.find(
    (dispatch) =>
      dispatch.sourceType === "MANAGED_SQUAD_JOIN_CONFIRMATION" &&
      isUsableDispatchStatus(dispatch.status),
  );
  const latestInviteMessage = dispatches.find(
    (dispatch) =>
      ACTIVATION_SOURCE_TYPES.includes(
        dispatch.sourceType as (typeof ACTIVATION_SOURCE_TYPES)[number],
      ) && isUsableDispatchStatus(dispatch.status),
  );

  const savedEmail = prospect.email?.trim() || (hasEmail ? "saved" : "");
  const savedPhone = prospect.phone?.trim() || (hasPhone ? "saved" : "");
  const hasSavedEmail = Boolean(savedEmail);
  const hasContact = hasSavedEmail || Boolean(savedPhone);
  const invitationTime = initialInvite
    ? initialInvite.sentAt ?? initialInvite.createdAt
    : null;
  const canFollowUp = Boolean(
    invitationTime && Date.now() - invitationTime.getTime() >= FOLLOW_UP_DELAY_MS,
  );
  const inviteTimeLabel = latestInviteMessage
    ? formatDateTime(
        latestInviteMessage.sentAt ??
          latestInviteMessage.failedAt ??
          latestInviteMessage.createdAt,
      )
    : null;
  const chaseTime = latestChase
    ? formatDateTime(
        latestChase.sentAt ?? latestChase.failedAt ?? latestChase.createdAt,
      )
    : null;

  const isDeclined = prospect.status === "DECLINED" || latestResponse?.response === "NO";

  return (
    <div data-prospect-workflow-card="true" className="space-y-3">
      <style>{`
        [data-prospect-workflow-card] + div,
        [data-prospect-workflow-card] + div + form,
        [data-prospect-workflow-card] + div + form + a {
          display: none !important;
        }
      `}</style>

      <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.08] p-4 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold text-white">Squad activation</div>
            <p className="mt-1 text-xs leading-5 text-white/60">
              Send the player their squad invite first. They move into the active
              squad automatically when they confirm using the email link.
            </p>
          </div>
          <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-100">
            First step
          </span>
        </div>

        {!hasSavedEmail ? (
          <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100">
            Add and save an email address before sending the squad activation
            invite.
          </div>
        ) : isDeclined ? (
          <div className="mt-3 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-100">
            This prospect has said no or is marked declined. Do not promote them
            unless their status is changed after speaking to them.
          </div>
        ) : !initialInvite ? (
          <form action={sendProspectSquadActivationAction} className="mt-3">
            <input type="hidden" name="teamid" value={teamid} />
            <input type="hidden" name="prospectId" value={prospectId} />
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/20 px-4 py-2.5 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-500/25"
            >
              Send squad activation email
            </button>
          </form>
        ) : (
          <div className="mt-3 space-y-3">
            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${getDispatchStatusClasses(
                latestInviteMessage?.status,
              )}`}
            >
              Squad invite {latestInviteMessage?.status.toLowerCase()}
              {inviteTimeLabel ? ` · ${inviteTimeLabel}` : ""}
            </span>

            <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100">
              Waiting for the player to confirm. Do not promote them manually;
              the activation link will add them to the squad automatically.
            </div>

            {canFollowUp ? (
              <form action={sendProspectSquadActivationReminderAction}>
                <input type="hidden" name="teamid" value={teamid} />
                <input type="hidden" name="prospectId" value={prospectId} />
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/15 px-4 py-2.5 text-sm font-semibold text-amber-50 transition hover:bg-amber-500/20"
                >
                  Send activation reminder
                </button>
              </form>
            ) : (
              <div className="text-xs leading-5 text-white/45">
                Give them 48 hours before sending a reminder or YES/NO nudge.
              </div>
            )}
          </div>
        )}
      </div>

      {initialInvite && canFollowUp && !isDeclined ? (
        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.07] p-4 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-white">YES/NO nudge</div>
              <p className="mt-1 text-xs leading-5 text-white/55">
                Use this only after the activation invite has had time to be seen.
              </p>
            </div>
            <span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">
              Follow-up
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <span
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getResponseClasses(
                latestResponse?.response,
              )}`}
            >
              {getResponseLabel(latestResponse?.response)}
              {latestResponse?.respondedAt
                ? ` · ${formatDateTime(latestResponse.respondedAt)}`
                : ""}
            </span>
            {latestChase ? (
              <span
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getDispatchStatusClasses(
                  latestChase.status,
                )}`}
              >
                Last nudge {latestChase.channel} {latestChase.status.toLowerCase()}
                {chaseTime ? ` · ${chaseTime}` : ""}
              </span>
            ) : (
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/55">
                No nudge sent yet
              </span>
            )}
          </div>

          {latestResponse?.response !== "YES" ? (
            <form action={sendProspectInterestChaseAction} className="mt-3">
              <input type="hidden" name="teamid" value={teamid} />
              <input type="hidden" name="prospectId" value={prospectId} />
              <button
                type="submit"
                disabled={!hasContact}
                className={`inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  hasContact
                    ? "border border-cyan-400/30 bg-cyan-500/15 text-cyan-50 hover:bg-cyan-500/20"
                    : "cursor-not-allowed border border-white/10 bg-white/5 text-white/35"
                }`}
              >
                {hasContact ? "Send YES/NO nudge" : "Add phone or email first"}
              </button>
            </form>
          ) : (
            <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs leading-5 text-emerald-100">
              They have said yes. Send an activation reminder if they have not yet
              used the squad link.
            </div>
          )}
        </div>
      ) : null}

      {!hasSavedEmail && !isDeclined ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.07] p-4 text-sm text-amber-100">
          <p className="leading-5">
            Manual promotion is available only as an exception when no email can
            be obtained. The player will not receive the normal activation link.
          </p>
          <form action={convertProspectToMemberAction} className="mt-3">
            <input type="hidden" name="teamid" value={teamid} />
            <input type="hidden" name="prospectId" value={prospectId} />
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/15 px-4 py-2.5 text-sm font-semibold text-amber-50 transition hover:bg-amber-500/20"
            >
              Add manually to squad
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
