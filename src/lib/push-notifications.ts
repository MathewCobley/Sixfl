import {
  createHash,
  createPrivateKey,
  randomBytes,
  sign,
} from "crypto";

import { prisma } from "@/lib/prisma";

export type PushNotificationTarget = {
  userId: string;
  title: string;
  body: string;
  url: string;
  tag: string;
  sourceType?: string | null;
  sourceId?: string | null;
};

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function hashPushDeviceToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createPushDeviceToken() {
  return randomBytes(32).toString("base64url");
}

function getVapidConfig() {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  const subject =
    process.env.WEB_PUSH_VAPID_SUBJECT?.trim() || "mailto:hello@sixfl.co.uk";

  if (!publicKey || !privateKey) return null;

  const publicBytes = Buffer.from(publicKey, "base64url");
  if (publicBytes.length !== 65 || publicBytes[0] !== 4) {
    throw new Error("WEB_PUSH_VAPID_PUBLIC_KEY is not a valid P-256 public key.");
  }

  const x = publicBytes.subarray(1, 33).toString("base64url");
  const y = publicBytes.subarray(33, 65).toString("base64url");

  return {
    publicKey,
    subject,
    signingKey: createPrivateKey({
      key: {
        kty: "EC",
        crv: "P-256",
        x,
        y,
        d: privateKey,
      },
      format: "jwk",
    }),
  };
}

function buildVapidAuthorization(endpoint: string) {
  const config = getVapidConfig();
  if (!config) return null;

  const audience = new URL(endpoint).origin;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ typ: "JWT", alg: "ES256" });
  const payload = base64UrlJson({
    aud: audience,
    exp: nowSeconds + 12 * 60 * 60,
    sub: config.subject,
  });
  const unsignedToken = `${header}.${payload}`;
  const signature = sign("sha256", Buffer.from(unsignedToken), {
    key: config.signingKey,
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");

  return {
    authorization: `vapid t=${unsignedToken}.${signature}, k=${config.publicKey}`,
  };
}

async function sendWake(subscription: { id: string; endpoint: string }) {
  try {
    const vapid = buildVapidAuthorization(subscription.endpoint);
    if (!vapid) {
      return { ok: false, skipped: true };
    }

    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: vapid.authorization,
        TTL: "60",
        Urgency: "normal",
      },
    });

    if (response.ok) {
      await prisma.pushSubscription.update({
        where: { id: subscription.id },
        data: { failureCount: 0 },
      });
      return { ok: true, skipped: false };
    }

    if (response.status === 404 || response.status === 410) {
      await prisma.pushSubscription.update({
        where: { id: subscription.id },
        data: {
          disabledAt: new Date(),
          failureCount: { increment: 1 },
        },
      });
      return { ok: false, skipped: false };
    }

    await prisma.pushSubscription.update({
      where: { id: subscription.id },
      data: { failureCount: { increment: 1 } },
    });
    return { ok: false, skipped: false };
  } catch (error) {
    console.warn("SIXFL push wake failed", {
      subscriptionId: subscription.id,
      message: error instanceof Error ? error.message : String(error),
    });

    await prisma.pushSubscription
      .update({
        where: { id: subscription.id },
        data: { failureCount: { increment: 1 } },
      })
      .catch(() => null);

    return { ok: false, skipped: false };
  }
}

export async function queuePushNotifications(
  targets: PushNotificationTarget[],
) {
  const uniqueTargets = Array.from(
    new Map(
      targets
        .filter((target) => target.userId && target.title && target.body)
        .map((target) => [target.userId, target]),
    ).values(),
  );

  if (uniqueTargets.length === 0) {
    return { targetedUsers: 0, activeDevices: 0, wakesSent: 0 };
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: {
      userId: { in: uniqueTargets.map((target) => target.userId) },
      disabledAt: null,
    },
    select: {
      id: true,
      userId: true,
      endpoint: true,
    },
  });

  if (subscriptions.length === 0) {
    return {
      targetedUsers: uniqueTargets.length,
      activeDevices: 0,
      wakesSent: 0,
    };
  }

  const subscribedUserIds = new Set(
    subscriptions.map((subscription) => subscription.userId),
  );
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.pushNotification.createMany({
    data: uniqueTargets
      .filter((target) => subscribedUserIds.has(target.userId))
      .map((target) => ({
        userId: target.userId,
        title: target.title,
        body: target.body,
        url: target.url,
        tag: target.tag,
        sourceType: target.sourceType ?? null,
        sourceId: target.sourceId ?? null,
        expiresAt,
      })),
  });

  const results = await Promise.all(
    subscriptions.map((subscription) => sendWake(subscription)),
  );

  return {
    targetedUsers: subscribedUserIds.size,
    activeDevices: subscriptions.length,
    wakesSent: results.filter((result) => result.ok).length,
  };
}
