// ========================================
// File: src/app/api/webhooks/twilio/route.ts
// ========================================

import { NextRequest, NextResponse } from "next/server";
import { handleTwilioWebhook } from "@/lib/notifications/webhooks";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest) {
  const configuredSecret = process.env.TWILIO_WEBHOOK_SECRET?.trim();

  if (!configuredSecret) {
    return true;
  }

  const providedSecret = request.headers.get("x-twilio-webhook-secret")?.trim();
  return providedSecret === configuredSecret;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const payload = Object.fromEntries(
      Array.from(formData.entries()).map(([key, value]) => [key, String(value)]),
    ) as Record<string, string>;

    const result = await handleTwilioWebhook(payload);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Twilio webhook processing failed.",
      },
      { status: 500 },
    );
  }
}
