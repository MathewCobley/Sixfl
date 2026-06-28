// ========================================
// File: src/app/api/admin/referees/[id]/communications/route.ts
// ========================================

import { NextResponse } from "next/server";
import { NotificationRecipientSourceType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function preview(value: string | null | undefined) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "—";
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function getWhen(input: {
  createdAt: Date;
  sentAt?: Date | null;
  receivedAt?: Date | null;
  failedAt?: Date | null;
}) {
  return input.receivedAt ?? input.sentAt ?? input.failedAt ?? input.createdAt;
}

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: RouteContext) {
  await requireAdmin();

  const { id } = await params;

  const referee = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  });

  if (!referee || referee.role !== "REFEREE") {
    return NextResponse.json({ items: [] });
  }

  const [dispatches, messages] = await Promise.all([
    prisma.notificationDispatch.findMany({
      where: {
        OR: [
          { sourceType: "REFEREE", sourceId: id },
          { sourceType: "REFEREE_INVITE", sourceId: id },
          { sourceType: "REFEREE_AVAILABILITY_MONTHLY_REQUEST", sourceId: { startsWith: `${id}:` } },
          {
            recipient: {
              sourceType: NotificationRecipientSourceType.REFEREE,
              sourceId: id,
            },
          },
        ],
      },
      orderBy: [{ createdAt: "desc" }],
      take: 20,
      select: {
        id: true,
        channel: true,
        status: true,
        subject: true,
        bodyText: true,
        createdAt: true,
        scheduledFor: true,
        sentAt: true,
        failedAt: true,
        failureReason: true,
        template: {
          select: {
            key: true,
            name: true,
          },
        },
      },
    }),
    prisma.messageEntry.findMany({
      where: {
        thread: {
          OR: [
            { sourceType: "REFEREE", sourceId: id },
            {
              recipient: {
                sourceType: NotificationRecipientSourceType.REFEREE,
                sourceId: id,
              },
            },
          ],
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 20,
      select: {
        id: true,
        channel: true,
        direction: true,
        participantRole: true,
        subject: true,
        body: true,
        textBody: true,
        createdAt: true,
        sentAt: true,
        receivedAt: true,
        toEmail: true,
        toNumber: true,
        fromEmail: true,
        fromNumber: true,
      },
    }),
  ]);

  const items = [
    ...dispatches.map((item) => ({
      id: `dispatch-${item.id}`,
      type: "dispatch",
      channel: item.channel,
      direction: "OUTBOUND",
      status: item.status,
      subject: item.subject ?? item.template?.name ?? null,
      body: preview(item.bodyText),
      detail: item.template?.key ? `Template: ${item.template.name} · ${item.template.key}` : "Direct referee message",
      contact: null,
      failureReason: item.failureReason,
      when: getWhen({ createdAt: item.createdAt, sentAt: item.sentAt, failedAt: item.failedAt }).toISOString(),
    })),
    ...messages.map((item) => ({
      id: `message-${item.id}`,
      type: "message",
      channel: item.channel,
      direction: item.direction,
      status: item.direction === "INBOUND" ? "RECEIVED" : "SENT",
      subject: item.subject,
      body: preview(item.textBody ?? item.body),
      detail: `${item.participantRole} ${item.direction.toLowerCase()}`,
      contact: item.direction === "INBOUND"
        ? item.fromEmail ?? item.fromNumber ?? null
        : item.toEmail ?? item.toNumber ?? null,
      failureReason: null,
      when: getWhen({ createdAt: item.createdAt, sentAt: item.sentAt, receivedAt: item.receivedAt }).toISOString(),
    })),
  ]
    .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
    .slice(0, 20);

  return NextResponse.json({ items });
}
