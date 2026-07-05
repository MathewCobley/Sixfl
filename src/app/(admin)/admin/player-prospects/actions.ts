// ========================================
// File: src/app/(admin)/admin/player-prospects/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  NotificationAudience,
  NotificationChannel,
  NotificationRecipientSourceType,
} from "@prisma/client";

import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import {
  queueManagedSquadJoinChaseEmail,
  queueManagedSquadJoinConfirmationEmail,
} from "@/lib/managed-squad/prospectJoinConfirmation";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { queueDirectNotification } from "@/lib/notifications/service";
import { createPlayerInterestResponseToken } from "@/lib/player-interest/response-token";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function buildRedirect(query: string) {
  return `/admin/player-prospects${query}`;
}

function buildRedirectWithParams(params: Record<string, string | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return `/admin/player-prospects${query ? `?${query}` : ""}`;
}

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "https://www.sixfl.co.uk"
  ).replace(/\/+$/, "");
}

function getProspectName(input: { firstName: string; lastName: string | null; email?: string | null }) {
  return [input.firstName, input.lastName].filter(Boolean).join(" ").trim() || input.email?.trim() || "Player";
}

function getFirstName(value: string) {
  return value.trim().split(/\s+/)[0] ?? "";
}

function buildYesNoUrls(input: { teamId?: string | null; prospectId: string }) {
  const token = createPlayerInterestResponseToken({
    teamId: input.teamId ?? null,
    recipientType: "prospect",
    recipientId: input.prospectId,
    expiresInDays: 45,
  });
  const encoded = encodeURIComponent(token);
  const base = getSiteUrl();
  return {
    yesResponseUrl: `${base}/player-response/yes?token=${encoded}`,
    noResponseUrl: `${base}/player-response/no?token=${encoded}`,
  };
}

async function revalidateProspectSurfaces(input: { prospectId: string; teamId: string | null }) {
  revalidatePath("/admin/player-prospects");
  revalidatePath(`/admin/player-prospects/${input.prospectId}/communications`);
  revalidatePath("/admin/messaging");
  if (input.teamId) {
    revalidatePath(`/admin/teams/${input.teamId}`);
    revalidatePath(`/admin/teams/${input.teamId}/squad`);
    revalidatePath(`/admin/teams/${input.teamId}/prospects`);
    revalidatePath(`/admin/teams/${input.teamId}/communications`);
  }
}

async function getOpenProspectForSquadEmail(prospectId: string) {
  if (!prospectId) return { ok: false as const, error: "Prospect not found." };
  const prospect = await prisma.teamPlayerProspect.findUnique({ where: { id: prospectId }, select: { id: true, email: true, teamId: true, status: true } });
  if (!prospect) return { ok: false as const, error: "Prospect not found." };
  if (prospect.status === "DECLINED" || prospect.status === "DUPLICATE") return { ok: false as const, error: "This prospect is closed and cannot be messaged from the open pipeline." };
  if (!prospect.teamId) return { ok: false as const, error: "Assign the prospect to a team first." };
  if (!prospect.email?.trim()) return { ok: false as const, error: "This prospect needs an email address first." };
  return { ok: true as const, prospect };
}

async function loadProspectForYesNoEmail(input: { prospectId: string; responseTeamId: string | null }) {
  const prospect = await prisma.teamPlayerProspect.findUnique({
    where: { id: input.prospectId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      status: true,
      teamId: true,
      team: { select: { id: true, name: true, logoUrl: true, league: { select: { name: true, season: true } } } },
    },
  });
  if (!prospect) return { ok: false as const, error: "Prospect not found." };
  if (prospect.status === "DECLINED" || prospect.status === "DUPLICATE") return { ok: false as const, error: "This prospect is closed and cannot be chased." };
  if (!prospect.email?.trim()) return { ok: false as const, error: "This prospect needs an email address first." };

  const teamId = prospect.teamId ?? input.responseTeamId;
  const team = prospect.teamId && prospect.team
    ? prospect.team
    : teamId
      ? await prisma.team.findUnique({ where: { id: teamId }, select: { id: true, name: true, logoUrl: true, league: { select: { name: true, season: true } } } })
      : null;
  if (teamId && !team) return { ok: false as const, error: "Selected team was not found." };
  return { ok: true as const, prospect, team };
}

export async function assignPlayerProspectToTeamAction(formData: FormData) {
  await requireAdmin();
  const prospectId = String(formData.get("prospectId") ?? "").trim();
  const teamId = String(formData.get("teamId") ?? "").trim();
  if (!prospectId || !teamId) redirect(buildRedirect("?error=Choose%20a%20team%20for%20the%20prospect."));
  const [prospect, team] = await Promise.all([
    prisma.teamPlayerProspect.findUnique({ where: { id: prospectId }, select: { id: true } }),
    prisma.team.findUnique({ where: { id: teamId }, select: { id: true } }),
  ]);
  if (!prospect) redirect(buildRedirect("?error=Prospect%20not%20found."));
  if (!team) redirect(buildRedirect("?error=Team%20not%20found."));
  await prisma.teamPlayerProspect.update({ where: { id: prospectId }, data: { teamId } });
  revalidatePath("/admin/player-prospects");
  revalidatePath(`/admin/player-prospects/${prospectId}/communications`);
  revalidatePath(`/admin/teams/${teamId}/prospects`);
  revalidatePath(`/captain/team/${teamId}/prospects`);
  redirect(buildRedirect("?saved=assigned"));
}

export async function sendPlayerProspectYesNoChaseAction(formData: FormData) {
  const { user } = await requireAdmin();
  const prospectId = String(formData.get("prospectId") ?? "").trim();
  const leagueId = String(formData.get("leagueId") ?? "").trim();
  const responseTeamId = String(formData.get("responseTeamId") ?? "").trim() || null;
  const loaded = await loadProspectForYesNoEmail({ prospectId, responseTeamId });
  if (!loaded.ok) redirect(buildRedirectWithParams({ error: loaded.error, leagueId }));

  const displayName = getProspectName(loaded.prospect);
  const email = loaded.prospect.email?.trim().toLowerCase() || null;
  if (!email) redirect(buildRedirectWithParams({ error: "This prospect needs an email address first.", leagueId }));

  const teamName = loaded.team?.name ?? "SIXFL";
  const leagueName = loaded.team?.league ? `${loaded.team.league.name}${loaded.team.league.season ? ` — ${loaded.team.league.season}` : ""}` : "SIXFL player pool";
  const urls = buildYesNoUrls({ teamId: loaded.team?.id ?? null, prospectId: loaded.prospect.id });
  const isGeneralPoolChase = !loaded.team;
  const subject = isGeneralPoolChase ? "Are you still looking to play 6-a-side?" : `Are you still looking to play for ${teamName}?`;
  const body = isGeneralPoolChase
    ? "Hi {{firstName}},\n\nJust checking whether you are still looking to play 6-a-side with SIXFL.\n\nPlease use these links so we can keep the player list accurate:\n\nYes: {{yesResponseUrl}}\nNo: {{noResponseUrl}}\n\nThanks,\nSIXFL"
    : "Hi {{firstName}},\n\nJust checking whether you are still looking to play with {{teamName}} through SIXFL.\n\nPlease use these links so we can keep the squad list accurate:\n\nYes: {{yesResponseUrl}}\nNo: {{noResponseUrl}}\n\nThanks,\nSIXFL";

  const recipient = await upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.GENERAL,
    sourceId: `team-prospect:${loaded.prospect.id}`,
    audience: NotificationAudience.PLAYER,
    displayName,
    email,
    phone: loaded.prospect.phone,
    transactionalEmailOptIn: true,
    transactionalSmsOptIn: true,
    marketingEmailOptIn: true,
    marketingSmsOptIn: true,
    metadata: { teamId: loaded.team?.id ?? null, teamName, prospectId: loaded.prospect.id, entityType: "TEAM_PLAYER_PROSPECT", isGeneralPoolChase },
  });

  const dispatch = await queueDirectNotification({
    recipientId: recipient.id,
    audience: NotificationAudience.PLAYER,
    channel: NotificationChannel.EMAIL,
    subject,
    body,
    variables: { firstName: getFirstName(displayName) || "there", fullName: displayName, teamName, leagueName, yesResponseUrl: urls.yesResponseUrl, noResponseUrl: urls.noResponseUrl },
    sourceType: "TEAM_PLAYER_PROSPECT",
    sourceId: loaded.prospect.id,
    emailBranding: { teamName, teamLogoUrl: loaded.team?.logoUrl ?? null, leagueName },
    metadata: { origin: "player_prospect_yes_no_chase", originLabel: isGeneralPoolChase ? "Resent general YES/NO chase from prospect pool" : "Resent YES/NO chase from prospect pool", teamId: loaded.team?.id ?? null, prospectId: loaded.prospect.id, recipientType: "prospect", yesResponseUrl: urls.yesResponseUrl, noResponseUrl: urls.noResponseUrl, templateKey: isGeneralPoolChase ? "player-prospect-general-yes-no-chase" : "player-prospect-yes-no-chase", isGeneralPoolChase },
    createdByUserId: user?.id ?? null,
  });
  await logNotificationDispatchToThread({ dispatch, recipient });
  await prisma.teamPlayerProspect.update({ where: { id: loaded.prospect.id }, data: { lastContactedAt: new Date(), status: loaded.prospect.status === "NEW" ? "CONTACTED" : undefined } });
  await revalidateProspectSurfaces({ prospectId: loaded.prospect.id, teamId: loaded.prospect.teamId ?? loaded.team?.id ?? null });
  redirect(buildRedirectWithParams({ saved: "yes-no-chase-queued", leagueId }));
}

export async function sendPlayerProspectSquadInviteAction(formData: FormData) {
  const { user } = await requireAdmin();
  const prospectId = String(formData.get("prospectId") ?? "").trim();
  const leagueId = String(formData.get("leagueId") ?? "").trim();
  const validation = await getOpenProspectForSquadEmail(prospectId);
  if (!validation.ok) redirect(buildRedirectWithParams({ error: validation.error, leagueId }));
  const result = await queueManagedSquadJoinConfirmationEmail({ prospectId: validation.prospect.id, createdByUserId: user?.id ?? null });
  await revalidateProspectSurfaces({ prospectId: validation.prospect.id, teamId: validation.prospect.teamId });
  redirect(buildRedirectWithParams({ saved: result.status === "already_sent" ? "squad-invite-already-sent" : "squad-invite-queued", leagueId }));
}

async function queueSquadInviteChase(input: { prospectId: string; chaseType: "CHASE" | "FINAL"; createdByUserId?: string | null }) {
  const validation = await getOpenProspectForSquadEmail(input.prospectId);
  if (!validation.ok) return { ok: false as const, error: validation.error };
  const result = await queueManagedSquadJoinChaseEmail({ prospectId: validation.prospect.id, chaseType: input.chaseType, createdByUserId: input.createdByUserId ?? null });
  await revalidateProspectSurfaces({ prospectId: validation.prospect.id, teamId: validation.prospect.teamId });
  if (!result.ok) return { ok: false as const, error: "The chase email could not be queued." };
  return { ok: true as const, prospectId: validation.prospect.id, status: result.status };
}

async function sendSquadInviteChase(input: { formData: FormData; chaseType: "CHASE" | "FINAL" }) {
  const { user } = await requireAdmin();
  const prospectId = String(input.formData.get("prospectId") ?? "").trim();
  const leagueId = String(input.formData.get("leagueId") ?? "").trim();
  const result = await queueSquadInviteChase({ prospectId, chaseType: input.chaseType, createdByUserId: user?.id ?? null });
  redirect(buildRedirectWithParams({ saved: result.ok ? input.chaseType === "FINAL" ? "squad-final-chase-queued" : "squad-chase-queued" : null, error: result.ok ? null : result.error, leagueId }));
}

export async function sendPlayerProspectSquadInviteChaseAction(formData: FormData) {
  await sendSquadInviteChase({ formData, chaseType: "CHASE" });
}

export async function sendPlayerProspectSquadInviteFinalChaseAction(formData: FormData) {
  await sendSquadInviteChase({ formData, chaseType: "FINAL" });
}

export async function queuePlayerProspectSquadInviteChaseAction(formData: FormData) {
  const { user } = await requireAdmin();
  const prospectId = String(formData.get("prospectId") ?? "").trim();
  return queueSquadInviteChase({ prospectId, chaseType: "CHASE", createdByUserId: user?.id ?? null });
}

export async function queuePlayerProspectSquadInviteFinalChaseAction(formData: FormData) {
  const { user } = await requireAdmin();
  const prospectId = String(formData.get("prospectId") ?? "").trim();
  return queueSquadInviteChase({ prospectId, chaseType: "FINAL", createdByUserId: user?.id ?? null });
}
