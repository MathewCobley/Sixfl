// ========================================
// File: src/lib/squad/activationToken.ts
// ========================================

import { createHmac, timingSafeEqual } from "crypto";

function getSecret() {
  const secret = process.env.NEXTAUTH_SECRET?.trim();

  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is required for squad activation links.");
  }

  return secret;
}

function signProspectId(prospectId: string) {
  return createHmac("sha256", getSecret())
    .update(prospectId)
    .digest("base64url");
}

export function createSquadActivationToken(prospectId: string) {
  const cleanProspectId = prospectId.trim();

  if (!cleanProspectId) {
    throw new Error("Prospect ID is required for squad activation links.");
  }

  return `${cleanProspectId}.${signProspectId(cleanProspectId)}`;
}

export function verifySquadActivationToken(token: string) {
  const cleanToken = token.trim();
  const [prospectId, signature, ...extra] = cleanToken.split(".");

  if (!prospectId || !signature || extra.length > 0) {
    return null;
  }

  const expectedSignature = signProspectId(prospectId);

  try {
    const supplied = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);

    if (supplied.length !== expected.length) {
      return null;
    }

    if (!timingSafeEqual(supplied, expected)) {
      return null;
    }

    return prospectId;
  } catch {
    return null;
  }
}
