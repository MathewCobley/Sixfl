import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/auth";
import {
  createPushDeviceToken,
  hashPushDeviceToken,
} from "@/lib/push-notifications";
import { prisma } from "@/lib/prisma";

async function requireUser() {
  const session = await getServerSession(authOptions).catch(() => null);
  const email = session?.user?.email?.trim().toLowerCase();

  if (!email) return null;

  return prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
}

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() || null;

  if (!publicKey) {
    return NextResponse.json(
      { error: "Push notifications are not configured yet." },
      { status: 503 },
    );
  }

  return NextResponse.json({ publicKey });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        endpoint?: unknown;
        keys?: { p256dh?: unknown; auth?: unknown };
      }
    | null;

  const endpoint = String(body?.endpoint ?? "").trim();
  const p256dh = String(body?.keys?.p256dh ?? "").trim() || null;
  const auth = String(body?.keys?.auth ?? "").trim() || null;

  if (!endpoint.startsWith("https://") || endpoint.length > 4000) {
    return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  }

  const deviceToken = createPushDeviceToken();
  const deviceTokenHash = hashPushDeviceToken(deviceToken);
  const userAgent = request.headers.get("user-agent")?.slice(0, 500) || null;
  const now = new Date();

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: {
      userId: user.id,
      p256dh,
      auth,
      deviceTokenHash,
      userAgent,
      lastSeenAt: now,
      disabledAt: null,
      failureCount: 0,
    },
    create: {
      userId: user.id,
      endpoint,
      p256dh,
      auth,
      deviceTokenHash,
      userAgent,
      lastSeenAt: now,
    },
  });

  return NextResponse.json({ ok: true, deviceToken });
}

export async function DELETE(request: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { endpoint?: unknown }
    | null;
  const endpoint = String(body?.endpoint ?? "").trim();

  if (!endpoint) {
    return NextResponse.json({ error: "Subscription endpoint required." }, { status: 400 });
  }

  await prisma.pushSubscription.updateMany({
    where: {
      userId: user.id,
      endpoint,
    },
    data: {
      disabledAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
