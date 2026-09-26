import {
  PortalConversationType,
  PortalMessageSenderRole,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getAdminPaymentActivity } from "./payment-activity";
import { getAdminLeadDecisionActivity } from "./lead-decision-activity";

export type AdminActivityKind =
  | "APP_MESSAGE"
  | "MESSAGE"
  | "LEAD"
  | "TEAM_PAYMENT"
  | "PLAYER_PAYMENT"
  | "CONFIRMATION"
  | "POLL"
  | "CUP"
  | "RESULT"
  | "DISPUTE";

export type AdminActivityItem = {
  id: string;
  kind: AdminActivityKind;
  title: string;
  detail: string;
  occurredAt: Date;
  href: string;
};

function compact(value: string | null | undefined, fallback: string) {
  const cleaned = String(value ?? "").trim().replace(/\s+/g, " ");
  return cleaned || fallback;
}

function preview(value: string | null | undefined, max = 110) {
  const cleaned = compact(value, "");
  if (!cleaned) return "";
  return cleaned.length <= max ? cleaned : `${cleaned.slice(0, max - 3)}...`;
}

function personName(input: {
  name?: string | null;
  email?: string | null;
}) {
  return compact(input.name, compact(input.email, "Someone"));
}

type PollActivityRow = {
  id: string;
  pollId: string;
  teamName: string;
  title: string;
  votedAt: Date;
  selectedOptions: string | null;
};

type CupActivityRow = {
  id: string;
  cupLeagueId: string;
  teamName: string;
  cupName: string;
  response: string;
  respondedAt: Date;
  respondedByName: string | null;
};

export async function getAdminLatestActivity(limit = 50): Promise<AdminActivityItem[]> {
  const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit) || 50));
  const sourceLimit = Math.max(5, safeLimit * 2);

  const [
    appMessages,
    messages,
    leads,
    paymentActivity,
    confirmations,
    polls,
    cupResponses,
    results,
    disputes,
    leadDecisions,
  ] = await Promise.all([
    prisma.portalMessage.findMany({
      where: {
        deletedAt: null,
        senderRole: {
          in: [
            PortalMessageSenderRole.CAPTAIN,
            PortalMessageSenderRole.PLAYER,
          ],
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take: sourceLimit,
      select: {
        id: true,
        body: true,
        createdAt: true,
        senderUser: { select: { name: true, email: true } },
        conversation: {
          select: {
            team: { select: { name: true } },
            type: true,
          },
        },
      },
    }),
    prisma.messageEntry.findMany({
      where: { direction: "INBOUND" },
      orderBy: [{ createdAt: "desc" }],
      take: sourceLimit,
      select: {
        id: true,
        body: true,
        subject: true,
        channel: true,
        createdAt: true,
        receivedAt: true,
        thread: {
          select: {
            id: true,
            contactName: true,
            contactEmail: true,
            contactPhone: true,
            team: { select: { name: true } },
            recipient: { select: { displayName: true } },
          },
        },
      },
    }),
    prisma.interestLead.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: sourceLimit,
      select: {
        id: true,
        interestType: true,
        contactName: true,
        teamName: true,
        area: true,
        source: true,
        createdAt: true,
      },
    }),
    getAdminPaymentActivity(sourceLimit),
    prisma.fixtureCaptainConfirmation.findMany({
      where: {
        status: { in: ["CONFIRMED", "ISSUE_RAISED"] },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: sourceLimit * 2,
      select: {
        id: true,
        status: true,
        note: true,
        confirmedAt: true,
        issueRaisedAt: true,
        updatedAt: true,
        team: { select: { id: true, name: true } },
        fixture: {
          select: {
            id: true,
            kickoffAt: true,
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
          },
        },
        confirmedByUser: {
          select: { role: true, name: true, email: true },
        },
      },
    }),
    prisma.$queryRaw<PollActivityRow[]>(Prisma.sql`
      SELECT
        recipient."id",
        recipient."pollId",
        recipient."teamName",
        poll."title",
        recipient."votedAt",
        STRING_AGG(option."label", ', ' ORDER BY option."sortOrder", option."label") AS "selectedOptions"
      FROM "SIXFLPollRecipient" recipient
      JOIN "SIXFLPoll" poll ON poll."id" = recipient."pollId"
      LEFT JOIN "SIXFLPollRecipientOption" selected ON selected."recipientId" = recipient."id"
      LEFT JOIN "SIXFLPollOption" option ON option."id" = selected."optionId"
      WHERE recipient."votedAt" IS NOT NULL
      GROUP BY recipient."id", poll."title"
      ORDER BY recipient."votedAt" DESC
      LIMIT ${sourceLimit}
    `),
    prisma.$queryRaw<CupActivityRow[]>(Prisma.sql`
      SELECT
        invitation."id",
        invitation."cupLeagueId",
        team."name" AS "teamName",
        cup."name" AS "cupName",
        invitation."response",
        invitation."respondedAt",
        invitation."respondedByName"
      FROM "CupInvitation" invitation
      JOIN "Team" team ON team."id" = invitation."teamId"
      JOIN "League" cup ON cup."id" = invitation."cupLeagueId"
      LEFT JOIN "User" actor ON actor."id" = invitation."respondedByUserId"
      WHERE invitation."respondedAt" IS NOT NULL
        AND invitation."response" IN ('YES', 'NO')
        AND (actor."id" IS NULL OR actor."role"::text <> 'ADMIN')
      ORDER BY invitation."respondedAt" DESC
      LIMIT ${sourceLimit}
    `),
    prisma.matchResult.findMany({
      where: {
        enteredByUserId: { not: null },
      },
      orderBy: [{ enteredAt: "desc" }],
      take: sourceLimit * 2,
      select: {
        id: true,
        homeScore: true,
        awayScore: true,
        enteredAt: true,
        fixture: {
          select: {
            id: true,
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
          },
        },
        enteredByUser: {
          select: { role: true, name: true, email: true },
        },
      },
    }),
    prisma.resultDispute.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: sourceLimit * 2,
      select: {
        id: true,
        description: true,
        createdAt: true,
        team: { select: { name: true } },
        matchResult: {
          select: {
            fixture: {
              select: {
                homeTeam: { select: { name: true } },
                awayTeam: { select: { name: true } },
              },
            },
          },
        },
        createdByUser: {
          select: { role: true, name: true, email: true },
        },
      },
    }),
    getAdminLeadDecisionActivity(sourceLimit),
  ]);

  const activity: AdminActivityItem[] = [];

  for (const item of appMessages) {
    const sender = personName(item.senderUser ?? {});
    const teamName = item.conversation.team.name;
    const conversationLabel =
      item.conversation.type === PortalConversationType.CAPTAIN_PLAYER
        ? "Private captain chat"
        : item.conversation.type === PortalConversationType.CAPTAIN_CAPTAIN
          ? "Private captain chat"
          : item.conversation.type === PortalConversationType.REGULARS
            ? "Regulars"
            : item.conversation.type === PortalConversationType.SELECTED_GROUP
              ? "Selected Players"
              : item.conversation.type === PortalConversationType.SIXFL
                ? "Message SIXFL"
                : "Whole Squad Chat";

    activity.push({
      id: `app-message:${item.id}`,
      kind: "APP_MESSAGE",
      title: `${sender} sent an app message · ${teamName}`,
      detail: `${conversationLabel} · ${preview(item.body, 100)}`,
      occurredAt: item.createdAt,
      href: "/admin/chat",
    });
  }

  for (const item of messages) {
    const sender =
      item.thread.team?.name ||
      item.thread.recipient?.displayName ||
      item.thread.contactName ||
      item.thread.contactEmail ||
      item.thread.contactPhone ||
      "Unknown contact";
    const text = preview(item.body || item.subject, 120);
    activity.push({
      id: `message:${item.id}`,
      kind: "MESSAGE",
      title: `Message received from ${sender}`,
      detail: text || `${item.channel.toLowerCase()} message received`,
      occurredAt: item.receivedAt ?? item.createdAt,
      href: `/admin/messages?filter=all&thread=${encodeURIComponent(item.thread.id)}`,
    });
  }

  for (const lead of leads) {
    const subject = lead.teamName || lead.area || lead.contactName;
    const type = lead.interestType.toLowerCase();
    activity.push({
      id: `lead:${lead.id}`,
      kind: "LEAD",
      title: `New ${type} lead: ${subject}`,
      detail: [lead.contactName, lead.area, lead.source].filter(Boolean).join(" · ") || "New enquiry received",
      occurredAt: lead.createdAt,
      href: "/admin/leads",
    });
  }

  activity.push(...paymentActivity, ...leadDecisions);

  for (const confirmation of confirmations) {
    if (confirmation.confirmedByUser?.role === "ADMIN") continue;
    const fixtureLabel = `${confirmation.fixture.homeTeam.name} v ${confirmation.fixture.awayTeam.name}`;
    const issue = confirmation.status === "ISSUE_RAISED";
    activity.push({
      id: `confirmation:${confirmation.id}`,
      kind: "CONFIRMATION",
      title: issue
        ? `${confirmation.team.name} raised a fixture issue`
        : `${confirmation.team.name} confirmed their fixture`,
      detail: issue
        ? preview(confirmation.note, 120) || fixtureLabel
        : fixtureLabel,
      occurredAt:
        (issue ? confirmation.issueRaisedAt : confirmation.confirmedAt) ??
        confirmation.updatedAt,
      href: "/admin/fixtures",
    });
  }

  for (const poll of polls) {
    activity.push({
      id: `poll:${poll.id}`,
      kind: "POLL",
      title: `${poll.teamName} completed a poll`,
      detail: `${poll.title}${poll.selectedOptions ? ` · ${poll.selectedOptions}` : ""}`,
      occurredAt: poll.votedAt,
      href: `/admin/polls/${encodeURIComponent(poll.pollId)}`,
    });
  }

  for (const cup of cupResponses) {
    const interested = cup.response === "YES";
    activity.push({
      id: `cup:${cup.id}`,
      kind: "CUP",
      title: interested
        ? `${cup.teamName} registered cup interest`
        : `${cup.teamName} declined the cup invitation`,
      detail: `${cup.cupName}${cup.respondedByName ? ` · ${cup.respondedByName}` : ""}`,
      occurredAt: cup.respondedAt,
      href: `/admin/cups/${encodeURIComponent(cup.cupLeagueId)}/invitations`,
    });
  }

  for (const result of results) {
    if (!result.enteredByUser || result.enteredByUser.role === "ADMIN") continue;
    activity.push({
      id: `result:${result.id}`,
      kind: "RESULT",
      title: `Result submitted: ${result.fixture.homeTeam.name} ${result.homeScore}-${result.awayScore} ${result.fixture.awayTeam.name}`,
      detail: `Submitted by ${personName(result.enteredByUser)}`,
      occurredAt: result.enteredAt,
      href: "/admin/results",
    });
  }

  for (const dispute of disputes) {
    if (dispute.createdByUser?.role === "ADMIN") continue;
    const fixture = dispute.matchResult.fixture;
    activity.push({
      id: `dispute:${dispute.id}`,
      kind: "DISPUTE",
      title: `${dispute.team.name} raised a result dispute`,
      detail: preview(dispute.description, 120) || `${fixture.homeTeam.name} v ${fixture.awayTeam.name}`,
      occurredAt: dispute.createdAt,
      href: "/admin/results",
    });
  }

  return activity
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || a.id.localeCompare(b.id))
    .slice(0, safeLimit);
}
