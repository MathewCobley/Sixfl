import { NextResponse } from "next/server";

import { hashPushDeviceToken } from "@/lib/push-notifications";
import { prisma } from "@/lib/prisma";

const ALLOWED_STATUSES = new Set([
  "SHOWN",
  "SUPPRESSED_VISIBLE",
  "CLICKED",
]);

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!token || token.length > 200) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { notificationId?: unknown; status?: unknown }
    | null;

  const notificationId = String(body?.notificationId ?? "").trim();
  const status = String(body?.status ?? "").trim().toUpperCase();

  if (!notificationId || !ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const tokenHash = hashPushDeviceToken(token);
  const subscription = await prisma.pushSubscription.findUnique({
    where: { deviceTokenHash: tokenHash },
    select: {
      id: true,
      userId: true,
      disabledAt: true,
    },
  });

  if (!subscription || subscription.disabledAt) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const notification = await prisma.pushNotification.findFirst({
    where: {
      id: notificationId,
      userId: subscription.userId,
    },
    select: { id: true },
  });

  if (!notification) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const now = new Date();

  await prisma.pushNotificationDelivery.upsert({
    where: {
      notificationId_subscriptionId: {
        notificationId: notification.id,
        subscriptionId: subscription.id,
      },
    },
    update: {
      status,
      recordedAt: now,
    },
    create: {
      notificationId: notification.id,
      subscriptionId: subscription.id,
      status,
      recordedAt: now,
    },
  });

  return NextResponse.json({ ok: true });
}
