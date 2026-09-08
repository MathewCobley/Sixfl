import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { isFixturePlaceholderTeam } from "@/lib/teams/fixture-placeholders";

export const FIRST_MATCH_READY_TEMPLATE = "captain-first-fixture-reminder";
export const FIRST_MATCH_READY_WINDOW_MS = 48 * 60 * 60 * 1000;
type Db = Pick<typeof prisma, "$queryRaw" | "team" | "fixture" | "notificationDispatch" | "notificationTemplate" | "notificationRecipient" | "notificationPreference">;
const emailKey = (value?: string | null) => value?.trim().toLowerCase() || "";
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const format = (date: Date) => formatDateTimeInLondon(date, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function firstMatchHistoryWhere(teamId: string): Prisma.NotificationDispatchWhereInput {
  return { sourceType: "TEAM", sourceId: teamId, channel: "EMAIL", OR: [
    { template: { is: { key: FIRST_MATCH_READY_TEMPLATE } } },
    { metadata: { path: ["templateKey"], equals: FIRST_MATCH_READY_TEMPLATE } },
    { AND: [{ metadata: { path: ["type"], equals: "captain_onboarding" } }, { metadata: { path: ["stage"], equals: "firstFixture" } }] },
  ] };
}

async function legacyMarker(teamId: string, db: Db = prisma) {
  const rows = await db.$queryRaw<Array<{ value: Date | null }>>(Prisma.sql`
    SELECT "onboardingFirstFixtureEmailSentAt" AS value FROM "Team" WHERE id = ${teamId}
  `);
  return rows[0]?.value ?? null;
}

/** Read-only match eligibility shared by cron, admin send and provider checks.
 * Read the first published match across the team's history, not just its next
 * future fixture. Missing old results must not make an established team new. */
async function readFirstMatch(teamId: string, db: Db = prisma) {
  const team = await db.team.findUnique({ where: { id: teamId }, select: {
    id: true, name: true, logoUrl: true, contactName: true, contactEmail: true,
    secondaryContactName: true, secondaryContactEmail: true,
    members: { where: { role: "CAPTAIN" }, orderBy: { createdAt: "asc" }, take: 1,
      select: { user: { select: { name: true, email: true } } } },
  } });
  if (!team) return { ok: false as const, reason: "Team not found." };
  if (await isFixturePlaceholderTeam(teamId, db)) return { ok: false as const, reason: "Placeholder teams do not receive onboarding emails." };
  const teamsWhere = { OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] };
  const played = await db.fixture.findFirst({ where: { AND: [teamsWhere, { OR: [{ status: "COMPLETED" }, { result: { isNot: null } }] }] }, select: { id: true } });
  if (played) return { ok: false as const, reason: "This team already has a completed match or recorded result; no first-match briefing is due." };
  const fixture = await db.fixture.findFirst({ where: {
    ...teamsWhere, publishedAt: { not: null }, status: { in: ["SCHEDULED", "COMPLETED"] },
  }, orderBy: [{ kickoffAt: "asc" }, { id: "asc" }], select: {
    id: true, leagueId: true, kickoffAt: true, publishedAt: true, status: true, pitch: true, venueId: true,
    homeTeamId: true, awayTeamId: true,
    homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } },
    venue: { select: { name: true, address: true, postcode: true } },
    league: { select: { name: true, season: true, venueName: true } },
  } });
  if (!fixture) return { ok: false as const, reason: "Waiting for the team's first published fixture." };
  const captain = team.members[0]?.user;
  const email = emailKey(captain?.email) || emailKey(team.contactEmail) || emailKey(team.secondaryContactEmail);
  const captainName = captain?.email?.trim() ? captain.name?.trim() : team.contactEmail?.trim() ? team.contactName?.trim() : team.secondaryContactName?.trim();
  const dueAt = new Date(fixture.kickoffAt.getTime() - FIRST_MATCH_READY_WINDOW_MS);
  const signature = JSON.stringify([fixture.id, fixture.kickoffAt.toISOString(), fixture.homeTeamId, fixture.awayTeamId,
    fixture.homeTeam.name, fixture.awayTeam.name, fixture.venueId, fixture.venue, fixture.pitch, fixture.leagueId, fixture.league]);
  return { ok: true as const, team, fixture, email, captainName: captainName || "Captain", dueAt, signature };
}

async function templateAvailable(db: Db) {
  const template = await db.notificationTemplate.findUnique({ where: { key: FIRST_MATCH_READY_TEMPLATE } });
  return Boolean(template?.isActive && template.channel === "EMAIL" && template.kind === "TRANSACTIONAL" && template.audience === "TEAM");
}

/** A single team row lock covers automatic and manual queueing. Legacy records
 * count as previous attempts; rollout never resets them to resend a new copy. */
export async function queueFirstMatchReadyEmail(input: { teamId: string; manual?: boolean; now?: Date }) {
  const now = input.now ?? new Date();
  const result = await prisma.$transaction(async db => {
    const locked = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM "Team" WHERE id = ${input.teamId} FOR UPDATE`);
    if (!locked.length) return { status: "missing_team" as const };
    const context = await readFirstMatch(input.teamId, db);
    if (!context.ok || context.fixture.status !== "SCHEDULED" || context.fixture.kickoffAt <= now) return { status: "not_due" as const };
    if (!input.manual && context.dueAt > now) return { status: "not_due" as const };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(context.email)) return { status: "missing_email" as const };
    if (!await templateAvailable(db)) return { status: "not_due" as const };
    const history = await db.notificationDispatch.findMany({ where: firstMatchHistoryWhere(input.teamId),
      select: { id: true, status: true, createdAt: true, sentAt: true },
    });
    if (history.some(d => d.status === "QUEUED" || d.status === "PROCESSING")) return { status: "not_due" as const };
    if (!input.manual && (history.length || await legacyMarker(input.teamId, db))) return { status: "not_due" as const };
    if (history.some(d => now.getTime() - (d.sentAt ?? d.createdAt).getTime() < 5 * 60_000)) return { status: "not_due" as const };
    const { team, fixture, email, captainName } = context;
    const site = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim() || process.env.NEXTAUTH_URL?.trim() || "https://www.sixfl.co.uk").replace(/\/+$/, "");
    const captainDashboardUrl = `${site}/captain/team/${team.id}`;
    // Use the existing selected-fixture route rather than an invented detail page.
    const fixtureUrl = `${captainDashboardUrl}/fixtures?fixtureId=${encodeURIComponent(fixture.id)}`;
    const details = { displayName: captainName, email, emailNormalized: email, lastSyncedAt: now };
    const recipient = await db.notificationRecipient.upsert({ where: { sourceType_sourceId: { sourceType: "TEAM", sourceId: team.id } },
      update: details, // Keep saved preferences/suppression; never silently opt someone back in.
      create: { ...details, sourceType: "TEAM", sourceId: team.id, audience: "TEAM", transactionalEmailOptIn: true,
        marketingEmailOptIn: false, marketingSmsOptIn: false, metadata: { teamId: team.id } },
    });
    await db.notificationPreference.upsert({ where: { recipientId: recipient.id }, update: {}, create: { recipientId: recipient.id } });
    const dispatch = await queueNotificationFromTemplate({ templateKey: FIRST_MATCH_READY_TEMPLATE, recipientId: recipient.id,
      sourceType: "TEAM", sourceId: team.id, scheduledFor: now,
      variables: {
        captainName, firstName: captainName.split(/\s+/)[0], teamName: team.name, captainDashboardUrl, fixtureUrl,
        fixturesUrl: fixtureUrl, rulesUrl: `${site}/league-rules`, matchRulesUrl: `${site}/match-rules`,
        fixtureName: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`,
        matchDate: formatDateTimeInLondon(fixture.kickoffAt, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
        kickoffTime: formatDateTimeInLondon(fixture.kickoffAt, { hour: "2-digit", minute: "2-digit" }),
        arrivalTime: formatDateTimeInLondon(new Date(fixture.kickoffAt.getTime() - 15 * 60_000), { hour: "2-digit", minute: "2-digit" }),
        venueName: fixture.venue?.name || fixture.league.venueName || "Check the fixture page for venue details",
        venueAddress: [fixture.venue?.address, fixture.venue?.postcode].filter(Boolean).join(", "),
        pitch: fixture.pitch || "Check the fixture page", leagueName: fixture.league.name,
      },
      emailBranding: { teamName: team.name, teamLogoUrl: team.logoUrl, leagueName: fixture.league.name },
      metadata: { type: "captain_onboarding", stage: "firstFixture", teamId: team.id, leagueId: fixture.leagueId,
        fixtureId: fixture.id, firstMatchBriefingVersion: 1, fixtureSignature: context.signature, toEmail: email,
        manual: input.manual === true, templateKey: FIRST_MATCH_READY_TEMPLATE, contactName: captainName,
        origin: "captain_first_match_ready", originLabel: "First-match readiness briefing" },
    }, db);
    if (dispatch.status === "QUEUED") await db.$executeRaw(Prisma.sql`
      UPDATE "Team" SET "onboardingFirstFixtureEmailSentAt" = COALESCE("onboardingFirstFixtureEmailSentAt", ${now}) WHERE id = ${team.id}
    `);
    return { status: dispatch.status === "QUEUED" ? "queued" as const : "not_due" as const, dispatch, recipient };
  }, { maxWait: 5000, timeout: 15000 });
  if ("dispatch" in result && result.dispatch && result.recipient) {
    try { await logNotificationDispatchToThread({ dispatch: result.dispatch, recipient: result.recipient }); }
    catch (error) { console.error("First-match email saved; timeline logging failed (not requeued)", { dispatchId: result.dispatch.id, error }); }
  }
  return result.status;
}

/** Do not allow delayed or now-stale briefings to leave the shared outbox.
 * Historical saved content is never rewritten. A cancelled attempt is visible
 * for admin review; it does not create an automatic resend loop. */
export async function getFirstMatchReadyDeliveryBlock(dispatch: {
  id: string; channel: string; sourceType: string | null; sourceId: string | null; createdAt: Date;
  recipientId: string; recipient: { email: string | null }; template: { key: string } | null; metadata: unknown;
}, now = new Date()) {
  const meta = object(dispatch.metadata);
  // Legacy queued/sent reminders remain historical records, not retroactive replacements.
  if (dispatch.channel !== "EMAIL" || meta.firstMatchBriefingVersion !== 1) return null;
  if (dispatch.sourceType !== "TEAM" || !dispatch.sourceId || dispatch.sourceId !== meta.teamId) return "First-match email is missing its team reference.";
  const context = await readFirstMatch(dispatch.sourceId);
  if (!context.ok) return context.reason;
  if (context.fixture.kickoffAt <= now || context.fixture.status !== "SCHEDULED") return "First match has started or is no longer scheduled.";
  if (context.fixture.id !== meta.fixtureId || context.signature !== meta.fixtureSignature) return "First-match fixture details changed after queueing. Review before resending.";
  if (meta.manual !== true && context.dueAt > now) return "First-match briefing is outside its 48-hour window.";
  if (context.email !== meta.toEmail || context.email !== emailKey(dispatch.recipient.email)) return "Captain/contact email changed after this briefing was queued.";
  if (!await templateAvailable(prisma)) return "First-match briefing template is disabled or incorrectly configured.";
  const recipient = await prisma.notificationRecipient.findUnique({ where: { id: dispatch.recipientId }, include: { preferences: true } });
  if (!recipient || emailKey(recipient.email) !== context.email || recipient.isSuppressed || !recipient.transactionalEmailOptIn || recipient.preferences?.emailEnabled === false) return "First-match email blocked by current recipient details or preferences.";
  const duplicate = await prisma.notificationDispatch.findFirst({ where: { ...firstMatchHistoryWhere(dispatch.sourceId), id: { not: dispatch.id }, AND: [{ OR: [
    { status: { in: ["QUEUED", "PROCESSING"] }, OR: [{ createdAt: { lt: dispatch.createdAt } }, { createdAt: dispatch.createdAt, id: { lt: dispatch.id } }] },
    { OR: [{ status: "SENT" }, { sentAt: { not: null } }, { providerMessageId: { not: null } }, { attempts: { some: { status: "SUCCESS" } } }], ...(meta.manual === true ? { createdAt: { gte: dispatch.createdAt } } : {}) },
  ] }] }, select: { id: true } });
  return duplicate ? "Another first-match briefing is already pending or sent; duplicate cancelled." : null;
}

/** Actual dispatch state, never an old queue timestamp labelled as delivered. */
export async function getFirstMatchReadyStatus(teamId: string, now = new Date()) {
  const dispatch = await prisma.notificationDispatch.findFirst({ where: firstMatchHistoryWhere(teamId), orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, status: true, scheduledFor: true, sentAt: true, failureReason: true },
  });
  if (dispatch) {
    const when = dispatch.status === "SENT" ? dispatch.sentAt : dispatch.status === "QUEUED" ? dispatch.scheduledFor : null;
    return `${dispatch.status}${when ? ` · ${format(when)}` : ""}${dispatch.failureReason ? ` — ${dispatch.failureReason}` : ""}`;
  }
  const legacy = await legacyMarker(teamId);
  if (legacy) return `Previously recorded ${format(legacy)}. Check team comms; no automatic resend.`;
  const context = await readFirstMatch(teamId);
  if (!context.ok) return context.reason;
  if (context.fixture.kickoffAt <= now) return "First published fixture has started; no automatic first-match email will be sent.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(context.email)) return "Waiting for a valid captain/contact email.";
  if (!await templateAvailable(prisma)) return "First-match briefing template is missing, disabled or incorrectly configured.";
  return context.dueAt > now ? `Due ${format(context.dueAt)} — 48 hours before the first match.` : "Due now — automatic pickup on the next notification run, before kick-off.";
}
