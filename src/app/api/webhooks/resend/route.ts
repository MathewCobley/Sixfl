// ========================================
// File: src/app/api/webhooks/resend/route.ts
// ========================================

import { NextRequest, NextResponse } from "next/server";
import { handleResendWebhook } from "@/lib/notifications/webhooks";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest) {
  const configuredSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();

  if (!configuredSecret) {
    return true;
  }

  const providedSecret = request.headers.get("x-resend-webhook-secret")?.trim();
  return providedSecret === configuredSecret;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const result = await handleResendWebhook(payload);

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Resend webhook processing failed.",
      },
      { status: 500 },
    );
  }
}
