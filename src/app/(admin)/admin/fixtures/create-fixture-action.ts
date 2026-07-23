// ========================================
// File: src/app/(admin)/admin/fixtures/create-fixture-action.ts
// ========================================

"use server";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/requireAdmin";
import { createFixtureAction as createFixtureLegacyAction } from "./actions-legacy";

function isNextRedirect(error: unknown) {
  if (!error || typeof error !== "object" || !("digest" in error)) return false;
  return String((error as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT");
}

function getFriendlyCreateError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002":
        return "A conflicting fixture already exists. Refresh the fixture list and check the teams, week and kick-off time.";
      case "P2003":
        return "One of the selected teams, the venue, referee or league is no longer valid. Refresh the page and select it again.";
      case "P2025":
        return "A selected team, venue, referee or league could not be found. Refresh the page and try again.";
      default:
        return `The fixture database rejected the request (${error.code}).`;
    }
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    if (
      message &&
      !message.includes("Invalid `prisma") &&
      !message.toLowerCase().includes("database")
    ) {
      return message;
    }
  }

  return "The fixture could not be created. Check every required field and try again.";
}

function buildFixturesReturnUrl(input: {
  leagueId: string;
  state: "success" | "error";
  message?: string;
  requestId?: string;
}) {
  const params = new URLSearchParams();
  if (input.leagueId) params.set("leagueId", input.leagueId);
  params.set("fixtureCreate", input.state);
  if (input.message) params.set("fixtureCreateMessage", input.message);
  if (input.requestId) params.set("fixtureRequestId", input.requestId);
  return `/admin/fixtures?${params.toString()}`;
}

export async function createFixtureAction(formData: FormData) {
  await requireAdmin();

  const leagueId = String(formData.get("leagueId") ?? "").trim();
  const requestId = randomUUID().slice(0, 8);

  try {
    await createFixtureLegacyAction(formData);
  } catch (error) {
    if (isNextRedirect(error)) {
      redirect(buildFixturesReturnUrl({ leagueId, state: "success" }));
    }

    const message = getFriendlyCreateError(error);
    console.error("Manual fixture creation failed", {
      requestId,
      leagueId,
      message,
      error,
    });

    redirect(
      buildFixturesReturnUrl({
        leagueId,
        state: "error",
        message,
        requestId,
      }),
    );
  }
}
