import { NextResponse } from "next/server";
import twilio from "twilio";

import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user, session } = await requireAdmin();

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const apiKeySid = process.env.TWILIO_API_KEY_SID?.trim();
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET?.trim();
  const twimlAppSid = process.env.TWILIO_TWIML_APP_SID?.trim();

  if (!accountSid || !apiKeySid || !apiKeySecret || !twimlAppSid) {
    return NextResponse.json(
      {
        error:
          "Browser calling is not configured. Add TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET and TWILIO_TWIML_APP_SID.",
      },
      { status: 503 },
    );
  }

  const rawIdentity = user?.email || session?.user?.email || "sixfl_admin";
  const identity = `sixfl_${rawIdentity}`
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .slice(0, 121);

  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;
  const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
    identity,
    ttl: 3600,
  });

  token.addGrant(
    new VoiceGrant({
      outgoingApplicationSid: twimlAppSid,
      incomingAllow: false,
    }),
  );

  return NextResponse.json({ token: token.toJwt(), identity });
}
