// ========================================
// File: src/app/(admin)/admin/communications/all-team-actions.ts
// ========================================

"use server";

import { redirect } from "next/navigation";
import { NotificationChannel } from "@prisma/client";

import { sendTeamBroadcastMessage } from "@/lib/communications/send-team-broadcast";
import { processNotificationQueue } from "@/lib/notifications/processor";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function text(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function safeRedirect(value: FormDataEntryValue | null, fallback: string) {
  const target = text(value) || fallback;
  return target.startsWith("/") ? target : fallback;
}

function appendRedirectParams(
  path: string,
  params: Record<string, string | number | null | undefined>,
) {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string | number] => {
      const value = entry[1];
      return value !== null && value !== undefined && String(value).trim() !== "";
    },
  );

  if (entries.length === 0) return path;

  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&")}`;
}

function hasUnresolvedTemplatePlaceholder(textValue: string) {
  return /\{\{[^}]+\}\}/.test(textValue);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "Unknown error";
}

async function processQueuedTeamEmails(queuedCount: number) {
  if (queuedCount <= 0) return;

  try {
    await processNotificationQueue(Math.max(queuedCount + 10, 25));
  } catch (error) {
    console.error("Failed to process selected team emails immediately", error);
  }
}

export async function sendAllTeamsCommunicationMessageAction(formData: FormData) {
  const { user } = await requireAdmin();

  const from = safeRedirect(formData.get("from"), "/admin/messaging/teams");
  const subject = text(formData.get("subject"));
  const body = text(formData.get("body"));
  const templateId = text(formData.get("templateId")) || null;
  const templateKey = text(formData.get("templateKey")) || null;
  const ctaLabel = text(formData.get("ctaLabel")) || null;
  const ctaUrl = text(formData.get("ctaUrl")) || null;
  const selectedTeamIds = Array.from(
    new Set(
      formData
        .getAll("teamIds")
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  );

  if (!body) {
    redirect(appendRedirectParams(from, { error: "Message body is required." }));
  }

  if (!subject) {
    redirect(appendRedirectParams(from, { error: "Email subject is required." }));
  }

  if (selectedTeamIds.length === 0) {
    redirect(appendRedirectParams(from, { error: "Select at least one team before queueing the email." }));
  }

  if (hasUnresolvedTemplatePlaceholder(subject) || hasUnresolvedTemplatePlaceholder(body)) {
    redirect(
      appendRedirectParams(from, {
        error:
          "The message still contains an unresolved template placeholder such as {{fixtures}}. Please edit the message before sending.",
      }),
    );
  }

  const teams = await prisma.team.findMany({
    where: {
      id: {
        in: selectedTeamIds,
      },
    },
    select: {
      id: true,
      name: true,
      league: {
        select: {
          name: true,
          season: true,
        },
      },
    },
    orderBy: [{ name: "asc" }],
  });

  if (teams.length === 0) {
    redirect(appendRedirectParams(from, { error: "No matching teams were found." }));
  }

  let queuedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const skippedTeamNames: string[] = [];
  const failedTeamNames: string[] = [];

  for (const team of teams) {
    try {
      const result = await sendTeamBroadcastMessage({
        teamId: team.id,
        channel: NotificationChannel.EMAIL,
        subject,
        body,
        templateId,
        templateKey,
        ctaLabel,
        ctaUrl,
        origin: "all_teams_communications_hub",
        originLabel: "Sent from all-teams communications picker",
        metadata: {
          broadcastType: "selected_teams",
          selectedTeamCount: selectedTeamIds.length,
          leagueName: team.league
            ? `${team.league.name}${team.league.season ? ` — ${team.league.season}` : ""}`
            : null,
        },
        createdByUserId: user?.id ?? null,
      });

      if (result.skipped) {
        skippedCount += 1;
        skippedTeamNames.push(team.name);
      } else {
        queuedCount += 1;
      }
    } catch (error) {
      failedCount += 1;
      failedTeamNames.push(team.name);

      console.error("All-team communication failed for team", {
        teamId: team.id,
        teamName: team.name,
        error: getErrorMessage(error),
      });
    }
  }

  if (queuedCount > 0) {
    await processQueuedTeamEmails(queuedCount);
  }

  if (queuedCount === 0 && failedCount > 0) {
    const failedNames = failedTeamNames.slice(0, 3).join(", ");
    const suffix = failedTeamNames.length > 3 ? ` and ${failedTeamNames.length - 3} more` : "";

    redirect(
      appendRedirectParams(from, {
        error: `No emails were queued. ${failedCount} team${failedCount === 1 ? "" : "s"} failed${failedNames ? `: ${failedNames}${suffix}` : ""}. Check the server logs for the exact error.`,
      }),
    );
  }

  if (queuedCount === 0 && skippedCount > 0 && failedCount === 0) {
    const skippedNames = skippedTeamNames.slice(0, 3).join(", ");
    const suffix = skippedTeamNames.length > 3 ? ` and ${skippedTeamNames.length - 3} more` : "";

    redirect(
      appendRedirectParams(from, {
        error: `No emails were queued. ${skippedCount} selected team${skippedCount === 1 ? "" : "s"} were skipped${skippedNames ? `: ${skippedNames}${suffix}` : ""}. Check the team contact email addresses.`,
      }),
    );
  }

  const params: Record<string, string | number> = {
    saved: "queued",
    channel: "email",
    count: queuedCount,
    skipped: skippedCount,
    failed: failedCount,
  };

  if (skippedCount > 0) {
    const skippedNames = skippedTeamNames.slice(0, 3).join(", ");
    const suffix = skippedTeamNames.length > 3 ? ` and ${skippedTeamNames.length - 3} more` : "";
    params.warning = `${skippedCount} team${skippedCount === 1 ? "" : "s"} skipped${skippedNames ? `: ${skippedNames}${suffix}` : ""}.`;
  }

  if (failedCount > 0) {
    const failedNames = failedTeamNames.slice(0, 3).join(", ");
    const suffix = failedTeamNames.length > 3 ? ` and ${failedTeamNames.length - 3} more` : "";
    params.warning = `${failedCount} team${failedCount === 1 ? "" : "s"} failed${failedNames ? `: ${failedNames}${suffix}` : ""}.`;
  }

  redirect(appendRedirectParams(from, params));
}
