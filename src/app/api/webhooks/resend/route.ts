// ========================================
// File: src/app/api/webhooks/resend/route.ts
// ========================================

import { NextResponse } from "next/server";
import { handleResendWebhook } from "@/lib/notifications/webhooks";
import {
  getResendWebhookDeliveryId,
  verifyResendWebhookRequest,
} from "@/lib/resend/verifyWebhook";

export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  const deliveryId = getResendWebhookDeliveryId(request);

  try {
    const { event } = await verifyResendWebhookRequest(request);
    const result = await handleResendWebhook(event);

    return jsonResponse({
      deliveryId,
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Resend webhook processing failed.";

    console.error("[resend] delivery webhook failed", {
      deliveryId,
      message,
    });

    if (
      message.includes("Missing Resend webhook headers") ||
      message.includes("RESEND_WEBHOOK_SECRET is missing")
    ) {
      return jsonResponse(
        {
          ok: false,
          deliveryId,
          error: message,
        },
        400,
      );
    }

    if (/signature|verify|verification|timestamp/i.test(message)) {
      return jsonResponse(
        {
          ok: false,
          deliveryId,
          error: "Invalid Resend webhook signature.",
        },
        401,
      );
    }

    return jsonResponse(
      {
        ok: false,
        deliveryId,
        error: message,
      },
      500,
    );
  }
}

export async function GET(): Promise<Response> {
  return jsonResponse({
    ok: true,
    route: "resend delivery webhook",
  });
}
