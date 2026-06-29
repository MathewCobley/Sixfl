// ========================================
// File: src/app/(admin)/admin/fixtures/confirmation-actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  FixtureCaptainConfirmationStatus,
  NotificationAudience,
  NotificationChannel,
  NotificationDispatchStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  queueFixtureConfirmationSmsReminder,
  type QueueFixtureConfirmationSmsResult,
} from "@/lib/fixtures/confirmation-reminders";
import { linkDispatchToThread } from "@/lib/messaging/service";
import { processNotificationQueue } from "@/lib/notifications/processor";
import { queueDirectNotification } from "@/lib/notifications/service";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import { requireAdmin } from "@/lib/requireAdmin";

const FIXTURE_CONFIRMATION_ISSUE_REPLY_SMS_SOURCE =
  "FIXTURE_CONFIRMATION_ISSUE_REPLY_SMS";

type FixtureIssueReplySmsNotice =
  | "queued"
  | "sent"
  | "skipped"
  | "unavailable"
  | "empty"
  | "error";

function parseRequiredString(value: FormDataEntryValue | null, fieldName: string) {
  const str = String(value ?? "").trim();

  if (!str) {
    throw new Error(`${fieldName} is required.`);
  }

  return str;
}

function getOptionalString(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str || null;
}

function buildAdminFixturesHref(input?: {
  notice?: "sms_queued" | "sms_skipped" | "sms_not_available" | "sms_error";
  teamName?: string;
  returnTo?: string;
  replySms?: FixtureIssueReplySmsNotice;
  replyTeamName?: string;
  leagueId?: string | null;
}) {
  const searchParams = new URLSearchParams();

  if (input?.notice) {
    searchParams.set("notice", input.notice);
  }

  if (input?.teamName?.trim()) {
    searchParams.set("teamName", input.teamName.trim());
  }

  if (input?.replySms) {
    searchParams.set("replySms", input.replySms);
  }

  if (input?.replyTeamName?.trim()) {
    searchParams.set("replyTeamName", input.replyTeamName.trim());
  }

  if (input?.leagueId?.trim()) {
    searchParams.set("leagueId", input.leagueId.trim());
  }

  const query = searchParams.toString();
  const baseHref = query ? `/admin/fixtures?${query}` : "/admin/fixtures";

  return input?.returnTo?.trim()
    ? `${baseHref}#${input.returnTo.trim()}`
    : baseHref;
}

function getRedirectFromResult(
  result: QueueFixtureConfirmationSmsResult,
  returnTo?: string,
  leagueId?: string | null,
) {
  if (result.ok) {
    return buildAdminFixturesHref({
      notice: "sms_queued",
      teamName: result.teamName,
      returnTo,
      leagueId,
    });
  }

  if (
    result.status === "no_phone" ||
    result.status === "skipped"
  ) {
    return buildAdminFixturesHref({
      notice: "sms_skipped",
      teamName: result.teamName,
      returnTo,
      leagueId,
    });
  }

  if (
    result.status === "confirmed" ||
    result.status === "issue_raised" ||
    result.status === "not_available"
  ) {
    return buildAdminFixturesHref({
      notice: "sms_not_available",
      teamName: result.teamName,
      returnTo,
      leagueId,
    });
  }

  return buildAdminFixturesHref({
    notice: "sms_error",
    teamName: result.teamName,
    returnTo,
    leagueId,
  });
}

async function processManualFixtureChaseImmediately() {
  try {
    await processNotificationQueue(10);
  } catch (error) {
    console.error("Failed to process manual fixture confirmation SMS immediately", error);
  }
}

export async function chaseFixtureConfirmationSmsAction(formData: FormData) {
  await requireAdmin();

  const fixtureId = parseRequiredString(formData.get("fixtureId"), "Fixture");
  const teamId = parseRequiredString(formData.get("teamId"), "Team");
  const returnTo = String(formData.get("returnTo") ?? "").trim();
  let leagueId = getOptionalString(formData.get("leagueId"));

  const result = await queueFixtureConfirmationSmsReminder({
    fixtureId,
    teamId,
    mode: "manual",
  });

  if (result.ok && result.status === "queued") {
    await processManualFixtureChaseImmediately();
  }

  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: {
      leagueId: true,
      league: {
        select: {
          slug: true,
        },
      },
    },
  });

  leagueId = fixture?.leagueId ?? leagueId;

  revalidatePath("/admin/fixtures");

  if (fixture?.leagueId) {
    revalidatePath(`/admin/leagues/${fixture.leagueId}`);
    revalidatePath(`/admin/leagues/${fixture.leagueId}/fixtures`);
  }

  revalidatePath(`/captain/team/${teamId}`);
  revalidatePath(`/captain/team/${teamId}/fixtures`);

  if (fixture?.league?.slug) {
    revalidatePath(`/leagues/${fixture.league.slug}`);
    revalidatePath(`/leagues/${fixture.league.slug}/fixtures`);
  }

  redirect(getRedirectFromResult(result, returnTo, leagueId));
}

export async function replyFixtureConfirmationIssueSmsAction(formData: FormData) {
  const { user } = await requireAdmin();

  const fixtureId = getOptionalString(formData.get("fixtureId"));
  const teamId = getOptionalString(formData.get("teamId"));
  const body = String(formData.get("body") ?? "").trim();
  const returnTo = getOptionalString(formData.get("returnTo")) ?? "fixture-issue-replies";
  let leagueId = getOptionalString(formData.get("leagueId"));
  let replySms: FixtureIssueReplySmsNotice = "error";
  let replyTeamName = "that team";

  try {
    if (!fixtureId || !teamId) {
      replySms = "unavailable";
    } else if (body.length < 2) {
      replySms = "empty";
    } else {
      const fixture = await prisma.fixture.findUnique({
        where: { id: fixtureId },
        select: {
          id: true,
          leagueId: true,
          status: true,
          kickoffAt: true,
          league: {
            select: {
              slug: true,
            },
          },
          homeTeam: {
            select: {
              id: true,
              name: true,
            },
          },
          awayTeam: {
            select: {
              id: true,
              name: true,
            },
          },
          captainConfirmations: {
            where: {
              teamId,
            },
            select: {
              status: true,
              note: true,
            },
            take: 1,
          },
        },
      });

      if (!fixture) {
        replySms = "unavailable";
      } else {
        leagueId = fixture.leagueId ?? leagueId;
        const isHomeTeam = fixture.homeTeam.id === teamId;
        const isAwayTeam = fixture.awayTeam.id === teamId;

        if (!isHomeTeam && !isAwayTeam) {
          replySms = "unavailable";
        } else {
          const team = isHomeTeam ? fixture.homeTeam : fixture.awayTeam;
          const opponent = isHomeTeam ? fixture.awayTeam : fixture.homeTeam;
          replyTeamName = team.name;
          const confirmation = fixture.captainConfirmations[0] ?? null;

          if (confirmation?.status !== FixtureCaptainConfirmationStatus.ISSUE_RAISED) {
            replySms = "unavailable";
          } else {
            const { snapshot, recipient } = await upsertTeamNotificationRecipient(teamId);

            if (!recipient.phone?.trim()) {
              replySms = "skipped";
            } else {
              const sourceId = `${fixture.id}:${teamId}:${Date.now()}`;
              const dispatch = await queueDirectNotification({
                recipientId: recipient.id,
                channel: NotificationChannel.SMS,
                audience: NotificationAudience.TEAM,
                body,
                isTransactional: true,
                sourceType: FIXTURE_CONFIRMATION_ISSUE_REPLY_SMS_SOURCE,
                sourceId,
                metadata: {
                  kind: "fixture_confirmation_issue_reply_sms",
                  fixtureId: fixture.id,
                  leagueId: fixture.leagueId,
                  teamId,
                  teamName: team.name,
                  opponentName: opponent.name,
                  issueNote: confirmation.note,
                  contactName: snapshot.primaryContact.name ?? team.name,
                },
                createdByUserId: user?.id ?? null,
              });

              if (dispatch.status !== NotificationDispatchStatus.QUEUED) {
                replySms = "skipped";
              } else {
                await linkDispatchToThread({
                  dispatchId: dispatch.id,
                  recipientId: recipient.id,
                  teamId,
                  leagueId: fixture.leagueId,
                  sourceType: FIXTURE_CONFIRMATION_ISSUE_REPLY_SMS_SOURCE,
                  sourceId,
                  contactName: snapshot.primaryContact.name ?? team.name,
                  phone: recipient.phone,
                  body: dispatch.bodyText,
                  toNumber: recipient.phone,
                  provider: "twilio",
                  providerStatus: "queued",
                  createdByUserId: user?.id ?? null,
                  sentAt: null,
                });

                replySms = "queued";

                try {
                  const processed = await processNotificationQueue(10);
                  const processedReply = processed.items.find(
                    (item) => item.dispatchId === dispatch.id,
                  );

                  if (processedReply?.status === "sent") {
                    replySms = "sent";
                  } else if (processedReply?.status === "failed") {
                    replySms = "error";
                  }
                } catch (error) {
                  console.error("Failed to process fixture issue SMS reply immediately", error);
                }

                revalidatePath("/admin");
                revalidatePath("/admin/fixtures");
                revalidatePath("/admin/messaging");
                revalidatePath(`/captain/team/${teamId}`);
                revalidatePath(`/captain/team/${teamId}/fixtures`);

                if (fixture.leagueId) {
                  revalidatePath(`/admin/leagues/${fixture.leagueId}`);
                  revalidatePath(`/admin/leagues/${fixture.leagueId}/fixtures`);
                }

                if (fixture.league?.slug) {
                  revalidatePath(`/leagues/${fixture.league.slug}`);
                  revalidatePath(`/leagues/${fixture.league.slug}/fixtures`);
                }
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("Failed to send fixture confirmation issue SMS reply", {
      fixtureId,
      teamId,
      error,
    });
    replySms = "error";
  }

  redirect(
    buildAdminFixturesHref({
      replySms,
      replyTeamName,
      returnTo,
      leagueId,
    }),
  );
}
