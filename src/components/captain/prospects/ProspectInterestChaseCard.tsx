// ========================================
// File: src/components/captain/prospects/ProspectInterestChaseCard.tsx
// ========================================

import { NotificationChannel, NotificationDispatchStatus, Prisma } from "@prisma/client";

import { sendProspectInterestChaseAction } from "@/app/captain/team/[teamid]/prospects/chase-actions";
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
  if (response === "YES") return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
  if (response === "NO") return "border-red-400/25 bg-red-500/10 text-red-100";
  return "border-white/10 bg-white/[0.04] text-white/60";
}

function getResponseLabel(response?: string | null) {
  if (response === "YES") return "YES — still interested";
  if (response === "NO") return "NO — follow up / remove";
  return "No YES/NO reply yet";
}

function isYesNoChaseDispatch(input: { subject: string | null; bodyText: string }) {
  return (
    input.subject?.toLowerCase().includes("still interested in playing") ||
    input.bodyText.toLowerCase().includes("are you still interested in playing for")
  );
}

export default async function ProspectInterestChaseCard({
  teamid,
  prospectId,
  hasEmail,
  hasPhone,
}: ProspectInterestChaseCardProps) {
  const [dispatches, responses] = await Promise.all([
    prisma.notificationDispatch.findMany({
      where: {
        sourceType: "TEAM_PLAYER_PROSPECT",
        sourceId: prospectId,
        channel: { in: [NotificationChannel.EMAIL, NotificationChannel.SMS] },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 12,
      select: {
        id: true,
        channel: true,
        status: true,
        subject: true,
        bodyText: true,
        createdAt: true,
        sentAt: true,
        failedAt: true,
      },
    }),
    prisma.$queryRaw<PlayerInterestResponseRow[]>(Prisma.sql`
      SELECT "id", "response", "respondedAt"
      FROM "PlayerInterestResponse"
      WHERE "teamId" = ${teamid}
        AND "prospectId" = ${prospectId}
      ORDER BY "respondedAt" DESC
      LIMIT 1
    `).catch(() => []),
  ]);

  const latestChase = dispatches.find(isYesNoChaseDispatch) ?? null;
  const latestResponse = responses[0] ?? null;
  const hasContact = hasEmail || hasPhone;
  const channelLabel = hasPhone ? "SMS" : "email";
  const chaseTime = latestChase
    ? formatDateTime(latestChase.sentAt ?? latestChase.failedAt ?? latestChase.createdAt)
    : null;

  return (
    <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.07] p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-white">YES/NO nudge</div>
          <p className="mt-1 text-xs leading-5 text-white/55">
            Sends one quick {channelLabel} asking if they still want to play.
          </p>
        </div>
        <span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">
          Chase
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getResponseClasses(latestResponse?.response)}`}>
          {getResponseLabel(latestResponse?.response)}
          {latestResponse?.respondedAt ? ` · ${formatDateTime(latestResponse.respondedAt)}` : ""}
        </span>
        {latestChase ? (
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getDispatchStatusClasses(latestChase.status)}`}>
            Last nudge {latestChase.channel} {latestChase.status.toLowerCase()}{chaseTime ? ` · ${chaseTime}` : ""}
          </span>
        ) : (
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/55">
            No nudge sent yet
          </span>
        )}
      </div>

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
          {hasContact ? `Send ${channelLabel} nudge` : "Add phone or email first"}
        </button>
      </form>
    </div>
  );
}
