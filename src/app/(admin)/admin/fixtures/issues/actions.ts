// ========================================
// File: src/app/(admin)/admin/fixtures/issues/actions.ts
// ========================================

"use server";

import {
  NotificationAudience,
  NotificationChannel,
  NotificationDispatchStatus,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { queueDirectNotification } from "@/lib/notifications/service";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

const FIXTURE_ISSUE_REPLY_SOURCE_TYPE = "FIXTURE_CONFIRMATION_REPLY";

function getString(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function getIssueSourceId(input: { fixtureId: string; teamId: string }) {
  return `${input.fixtureId}:${input.teamId}`;
}

function buildNightBoardRedirect(input: {
  returnTo?: string | null;
  notice?: string;
  teamName?: string | null;
}) {
  const rawReturnTo = input.returnTo?.trim();
  if (!rawReturnTo?.startsWith("/admin/night-board")) return null;

  try {
    const url = new URL(rawReturnTo, "https://sixfl.local");
    if (url.pathname !== "/admin/night-board") return null;

    if (input.notice) url.searchParams.set("issueReply", input.notice);
    else url.searchParams.delete("issueReply");

    if (input.teamName) url.searchParams.set("issueTeam", input.teamName);
    else url.searchParams.delete("issueTeam");

    const query = url.searchParams.toString();
    return `${url.pathname}${query ? `?${query}` : ""}`;
  } catch {
    return null;
  }
}

function buildRedirect(input: {
  leagueId?: string | null;
  notice?: string;
  teamName?: string | null;
  returnTo?: string | null;
}) {
  const nightBoardRedirect = buildNightBoardRedirect(input);
  if (nightBoardRedirect) return nightBoardRedirect;

  const searchParams = new URLSearchParams();

  if (input.leagueId) {
    searchParams.set("leagueId", input.leagueId);
  }

  if (input.notice) {
    searchParams.set("notice", input.notice);
  }

  if (input.teamName) {
    searchParams.set("teamName", input.teamName);
  }

  const qs = searchParams.toString();
  return `/admin/fixtures/issues${qs ? `?${qs}` : ""}`;
}

function formatKickoff(value: Date | null) {
  if (!value) return null;

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(value);
}

export async function replyToFixtureIssueAction(formData: FormData) {
  const { user } = await requireAdmin();

  const fixtureId = getString(formData.get("fixtureId"));
  const teamId = getString(formData.get("teamId"));
  const leagueId = getString(formData.get("leagueId"));
  const reply = getString(formData.get("reply"));
  const returnTo = getString(formData.get("returnTo"));

  if (!fixtureId || !teamId) {
    redirect(buildRedirect({ leagueId, notice: "missing_issue", returnTo }));
  }

  if (reply.length < 5) {
    redirect(buildRedirect({ leagueId, notice: "reply_too_short", returnTo }));
  }

  const confirmation = await prisma.fixtureCaptainConfirmation.findUnique({
    where: {
      fixtureId_teamId: {
        fixtureId,
        teamId,
      },
    },
    select: {
      id: true,
      status: true,
      note: true,
      team: {
        select: {
          id: true,
          name: true,
        },
      },
      fixture: {
        select: {
          id: true,
          leagueId: true,
          kickoffAt: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
  });

  if (!confirmation || confirmation.status !== "ISSUE_RAISED") {
    redirect(buildRedirect({ leagueId, notice: "issue_not_found", returnTo }));
  }

  const { recipient, snapshot } = await upsertTeamNotificationRecipient(teamId);
  const sourceId = getIssueSourceId({ fixtureId, teamId });
  const kickoffLabel = formatKickoff(confirmation.fixture.kickoffAt);
  const fixtureLabel = `${confirmation.fixture.homeTeam.name} vs ${confirmation.fixture.awayTeam.name}${
    kickoffLabel ? `, ${kickoffLabel}` : ""
  }`;

  const body = [
    `Hi ${snapshot.primaryContact.name ?? confirmation.team.name},`,
    "",
    `Thanks for raising the fixture issue for ${fixtureLabel}.`,
    "",
    reply,
    "",
    "Please reply or update the fixture confirmation if anything changes.",
  ].join("\n");

  let notice = "reply_error";

  try {
    const dispatch = await queueDirectNotification({
      recipientId: recipient.id,
      channel: NotificationChannel.EMAIL,
      audience: NotificationAudience.TEAM,
      subject: `SIXFL reply: ${confirmation.team.name} fixture issue`,
      body,
      isTransactional: true,
      sourceType: FIXTURE_ISSUE_REPLY_SOURCE_TYPE,
      sourceId,
      metadata: {
        fixtureId,
        teamId,
        confirmationId: confirmation.id,
        originalIssueNote: confirmation.note,
        fixtureLabel,
        replyType: "admin-fixture-issue-reply",
      },
      createdByUserId: user?.id ?? null,
    });

    await prisma.fixtureCaptainConfirmation.update({
      where: {
        fixtureId_teamId: {
          fixtureId,
          teamId,
        },
      },
      data: {
        lastChasedAt: new Date(),
      },
    });

    revalidatePath("/admin/fixtures");
    revalidatePath("/admin/fixtures/issues");
    revalidatePath("/admin/night-board");
    revalidatePath(`/captain/team/${teamId}`);
    revalidatePath(`/captain/team/${teamId}/fixtures`);

    notice =
      dispatch.status === NotificationDispatchStatus.QUEUED
        ? "reply_queued"
        : "reply_skipped";
  } catch {
    notice = "reply_error";
  }

  redirect(
    buildRedirect({
      leagueId: confirmation.fixture.leagueId,
      notice,
      teamName: confirmation.team.name,
      returnTo,
    }),
  );
}
