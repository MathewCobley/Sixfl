import { NextResponse } from "next/server";

import { hashPushDeviceToken } from "@/lib/push-notifications";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!token || token.length > 200) {
    return NextResponse.json({ notification: null }, { status: 401 });
  }

  const tokenHash = hashPushDeviceToken(token);
  const subscription = await prisma.pushSubscription.findUnique({
    where: { deviceTokenHash: tokenHash },
    select: {
      id: true,
      userId: true,
      createdAt: true,
      lastDeliveredAt: true,
      disabledAt: true,
    },
  });

  if (!subscription || subscription.disabledAt) {
    return NextResponse.json({ notification: null }, { status: 401 });
  }

  const baseline = subscription.lastDeliveredAt ?? subscription.createdAt;
  const now = new Date();

  const notification = await prisma.pushNotification.findFirst({
    where: {
      userId: subscription.userId,
      createdAt: { gt: baseline },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      body: true,
      url: true,
      tag: true,
      createdAt: true,
    },
  });

  if (!notification) {
    await prisma.pushSubscription.update({
      where: { id: subscription.id },
      data: { lastSeenAt: now },
    });

    return NextResponse.json(
      { notification: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  await prisma.$transaction([
    prisma.pushSubscription.update({
      where: { id: subscription.id },
      data: {
        lastSeenAt: now,
        lastDeliveredAt: notification.createdAt,
        failureCount: 0,
      },
    }),
    prisma.pushNotificationDelivery.upsert({
      where: {
        notificationId_subscriptionId: {
          notificationId: notification.id,
          subscriptionId: subscription.id,
        },
      },
      update: {
        status: "FETCHED",
        recordedAt: now,
      },
      create: {
        notificationId: notification.id,
        subscriptionId: subscription.id,
        status: "FETCHED",
        recordedAt: now,
      },
    }),
  ]);

  return NextResponse.json(
    {
      notification: {
        id: notification.id,
        title: notification.title,
        body: notification.body,
        url: notification.url,
        tag: notification.tag || "sixfl",
        timestamp: notification.createdAt.getTime(),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
