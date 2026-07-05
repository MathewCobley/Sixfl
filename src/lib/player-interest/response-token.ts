// ========================================
// File: src/lib/player-interest/response-token.ts
// ========================================

import { createHmac, createHash } from "crypto";

export type PlayerInterestRecipientType = "teamMember" | "prospect";

export type PlayerInterestResponsePayload = {
  teamId: string | null;
  recipientType: PlayerInterestRecipientType;
  recipientId: string;
  exp: number;
};

function getSigningSecret() {
  const secret =
    process.env.PLAYER_RESPONSE_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim();

  if (!secret) {
    throw new Error("Missing player response signing secret.");
  }

  return secret;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(encodedPayload: string) {
  return createHmac("sha256", getSigningSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function safeEqual(a: string, b: string) {
  return a.length === b.length && createHash("sha256").update(a).digest("hex") === createHash("sha256").update(b).digest("hex");
}

export function createPlayerInterestResponseToken(input: {
  teamId?: string | null;
  recipientType: PlayerInterestRecipientType;
  recipientId: string;
  expiresInDays?: number;
}) {
  const payload: PlayerInterestResponsePayload = {
    teamId: input.teamId?.trim() || null,
    recipientType: input.recipientType,
    recipientId: input.recipientId,
    exp: Math.floor(Date.now() / 1000) + (input.expiresInDays ?? 30) * 24 * 60 * 60,
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function verifyPlayerInterestResponseToken(token: string) {
  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) return null;

  const expectedSignature = signPayload(encodedPayload);
  if (!safeEqual(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as Partial<PlayerInterestResponsePayload>;

    if (
      !payload.recipientId ||
      (payload.recipientType !== "teamMember" && payload.recipientType !== "prospect") ||
      !payload.exp ||
      payload.exp < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    if (payload.recipientType === "teamMember" && !payload.teamId) return null;

    return {
      teamId: payload.teamId?.trim() || null,
      recipientType: payload.recipientType,
      recipientId: payload.recipientId,
      exp: payload.exp,
    } as PlayerInterestResponsePayload;
  } catch {
    return null;
  }
}

export function getPlayerInterestTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
