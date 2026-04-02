// ========================================
// File: src/app/api/resend/inbound-email/route.ts
// ========================================

import { NextResponse } from "next/server";
import { handleInboundEmailWebhook } from "@/lib/email/inbound";
import {
  getResendWebhookDeliveryId,
  verifyResendWebhookRequest,
} from "@/lib/resend/verifyWebhook";

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): NextResponse {
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
    const result = await handleInboundEmailWebhook(event);

    return jsonResponse({
      ok: true,
      deliveryId,
      result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Inbound email webhook failed.";

    console.error("[resend] inbound email webhook failed", {
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
    route: "resend inbound email webhook",
  });
}
