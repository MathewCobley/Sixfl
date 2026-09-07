import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import { buildProspectEmailContext } from "@/lib/managed-squad/prospectJoinConfirmation";
import { normalizePhoneNumber } from "@/lib/messaging/phone";
import { playerNamesMatch } from "@/lib/players/player-identity-safety";
import { createSquadActivationToken } from "@/lib/squad/activationToken";

export const SQUAD_ACTIVATION_EMAIL_KEY = "squad-activation-email";
type Db = Prisma.TransactionClient;
type Mode = "automatic" | "initial" | "resend";
const RECENT_SEND_MS = 5 * 60 * 1000;
const normaliseEmail = (value?: string | null) => value?.trim().toLowerCase() || "";
const displayName = (p: { firstName: string; lastName: string | null }) => [p.firstName,p.lastName].filter(Boolean).join(" ").trim();
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

function activationWhere(prospectId: string): Prisma.NotificationDispatchWhereInput {
  return { sourceType: "TEAM_PLAYER_PROSPECT", sourceId: prospectId, channel: "EMAIL", OR: [
    { template: { is: { key: SQUAD_ACTIVATION_EMAIL_KEY } } },
    { metadata: { path: ["templateKey"], equals: SQUAD_ACTIVATION_EMAIL_KEY } },
  ] };
}

/** The state is authoritative, not which UI happened to promote the prospect.
 * Read only: never creates/links accounts, activates membership, or changes consent. */
async function readEligibility(prospectId: string, db: Db = prisma, automatic = true) {
  const prospect = await db.teamPlayerProspect.findUnique({ where: { id: prospectId }, select: {
    id: true, firstName: true, lastName: true, email: true, phone: true, teamId: true, status: true,
    team: { select: { id: true, name: true, logoUrl: true, teamMode: true,
      league: { select: { id: true, name: true, season: true, area: true, dayOfWeek: true, venueName: true } },
    } },
  } });
  const hold = (reason: string) => ({ prospect, eligible: false, reason });
  if (!prospect?.teamId || !prospect.team || prospect.status !== "ACTIVE_SQUAD") return hold("This player is no longer awaiting squad activation.");
  if (automatic && prospect.team.teamMode !== "MANAGED") return hold("Automatic activation applies to managed squads; use the activation controls for this team.");
  const email = normaliseEmail(prospect.email);
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return hold("Automatic activation is waiting for a valid player email address.");
  const linked = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT member."id" FROM "TeamMember" member
    JOIN "User" account ON account."id" = member."userId"
    LEFT JOIN "TeamMemberProfile" profile ON profile."teamMemberId" = member."id"
    WHERE member."teamId" = ${prospect.teamId}
      AND (profile."sourceProspectId" = ${prospect.id} OR LOWER(TRIM(account."email")) = ${email})
    LIMIT 1
  `);
  if (linked.length) return hold("A squad account is already linked; no automatic activation email is needed.");
  const user = await db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true, name: true } });
  if (user && !playerNamesMatch(user.name, displayName(prospect))) return hold("Email/account identity needs checking before an activation email can be sent.");
  const otherProspects = await db.teamPlayerProspect.findMany({ where: { id: { not: prospect.id },
    email: { equals: email, mode: "insensitive" }, status: { notIn: ["DECLINED", "DUPLICATE"] },
  }, select: { firstName: true, lastName: true } });
  if (otherProspects.some(other => !playerNamesMatch(displayName(other), displayName(prospect)))) return hold("This email is shared by differently named player records. Check the player's own email before activation.");
  const recipient = await db.notificationRecipient.findUnique({ where: {
    sourceType_sourceId: { sourceType: "GENERAL", sourceId: `team-prospect:${prospect.id}` },
  }, include: { preferences: true } });
  if (recipient && (recipient.isSuppressed || !recipient.transactionalEmailOptIn || recipient.preferences?.emailEnabled === false)) return hold("Activation email is blocked by this contact's email preferences or suppression. Review the contact first.");
  const template = await db.notificationTemplate.findUnique({ where: { key: SQUAD_ACTIVATION_EMAIL_KEY } });
  if (!template?.isActive) return hold("Activation email template is missing or disabled. Review System Templates.");
  if (template.channel !== "EMAIL" || template.kind !== "TRANSACTIONAL" || template.audience !== "PLAYER") return hold("Activation template must be a transactional player email. Review System Templates.");
  return { prospect, eligible: true, reason: "Activation email will be queued automatically on the next notification run." };
}

/** Read-only UI and cron share exactly the same eligibility checks. */
export async function getPendingActivationEmailStatus(prospectId: string) {
  const state = await readEligibility(prospectId);
  if (!state.eligible) return state.reason;
  const existing = await prisma.notificationDispatch.findFirst({ where: activationWhere(prospectId), select: { status: true }, orderBy: { createdAt: "desc" } });
  if (existing) return `Activation email ${existing.status.toLowerCase()}; check the communication history. It will not be sent again automatically.`;
  return state.reason;
}

/** Lock + outbox write in one transaction. Manual send and the recurring state
 * sweep use this same entry point, so an overlapping request cannot duplicate it.
 * Any previous attempt holds automatic sending, including FAILED or CANCELLED;
 * retry/resend is an explicit admin action, never a five-minute resend loop. */
export async function queuePendingSquadActivationEmail(input: {
  prospectId: string; teamId?: string; mode?: Mode; createdByUserId?: string | null;
}) {
  const mode = input.mode ?? "automatic";
  const result = await prisma.$transaction(async (db) => {
    const locked = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "TeamPlayerProspect" WHERE "id" = ${input.prospectId} FOR UPDATE
    `);
    if (!locked.length) return { queued: false as const, reason: "Pending player no longer exists." };
    const state = await readEligibility(input.prospectId, db, mode === "automatic");
    const p = state.prospect;
    if (!state.eligible || !p?.team || !p.teamId) return { queued: false as const, reason: state.reason };
    if (input.teamId && p.teamId !== input.teamId) return { queued: false as const, reason: "The player has moved team. Refresh the squad page." };
    const history = await db.notificationDispatch.findMany({ where: activationWhere(p.id),
      select: { status: true, createdAt: true, sentAt: true, providerMessageId: true }, orderBy: { createdAt: "desc" },
    });
    if (history.some(d => d.status === "QUEUED" || d.status === "PROCESSING")) return { queued: false as const, reason: "An activation email is already queued or being processed." };
    if (history.length && mode !== "resend") return { queued: false as const, reason: "An activation email already has a recorded attempt. Review its status or explicitly resend; no duplicate was queued." };
    if (history.some(d => Date.now() - (d.sentAt ?? d.createdAt).getTime() < RECENT_SEND_MS)) return { queued: false as const, reason: "An activation email was requested recently. Wait five minutes before explicitly resending." };
    const context = await buildProspectEmailContext(p);
    if (!context) return { queued: false as const, reason: "The player's activation details could not be resolved." };
    // Reuse the complete editable-template context, but point account activation
    // at the existing signed activation route, not a new authentication shortcut.
    const origin = new URL(context.joinConfirmationUrl).origin;
    const squadActivationUrl = `${origin}/squad/activate/${encodeURIComponent(createSquadActivationToken(p.id))}`;
    const contact = { displayName: context.displayName, email: normaliseEmail(p.email), emailNormalized: normaliseEmail(p.email),
      phone: p.phone, phoneNormalized: normalizePhoneNumber(p.phone), lastSyncedAt: new Date() };
    const recipient = await db.notificationRecipient.upsert({ where: { sourceType_sourceId: { sourceType: "GENERAL", sourceId: `team-prospect:${p.id}` } },
      update: contact, // Never reset existing opt-outs, suppression or preferences.
      create: { ...contact, sourceType: "GENERAL", sourceId: `team-prospect:${p.id}`, audience: "PLAYER",
        transactionalEmailOptIn: true, marketingEmailOptIn: false, marketingSmsOptIn: false,
        metadata: { teamId: p.teamId, prospectId: p.id, entityType: "TEAM_PLAYER_PROSPECT" } },
    });
    await db.notificationPreference.upsert({ where: { recipientId: recipient.id }, update: {}, create: { recipientId: recipient.id } });
    const dispatch = await queueNotificationFromTemplate({ templateKey: SQUAD_ACTIVATION_EMAIL_KEY, recipientId: recipient.id,
      sourceType: "TEAM_PLAYER_PROSPECT", sourceId: p.id,
      variables: { ...context.variables, squadActivationUrl, teamJoinUrl: squadActivationUrl },
      emailBranding: { teamName: p.team.name, teamLogoUrl: p.team.logoUrl, leagueName: context.leagueName },
      metadata: { origin: mode === "automatic" ? "automatic_pending_squad_activation" : "admin_managed_squad_activation_email",
        originLabel: mode === "automatic" ? "Automatic pending squad activation" : "Admin squad activation",
        templateKey: SQUAD_ACTIVATION_EMAIL_KEY, teamId: p.teamId, prospectId: p.id,
        contactName: context.displayName, activationEmail: contact.email, activationMode: mode },
      createdByUserId: input.createdByUserId ?? null,
    }, db);
    // Do not update the prospect merely for queuing: updatedAt labels promotion
    // in existing screens, and it must not turn into the time a cron last ran.
    return { queued: dispatch.status === "QUEUED", reason: dispatch.failureReason ?? `Activation email ${dispatch.status.toLowerCase()}.`, dispatch, recipient };
  }, { maxWait: 5000, timeout: 15000 });
  if ("dispatch" in result && result.dispatch && result.recipient) {
    try { await logNotificationDispatchToThread({ dispatch: result.dispatch, recipient: result.recipient }); }
    catch (error) { console.error("Activation outbox saved; communication logging failed (no resend)", { dispatchId: result.dispatch.id, error }); }
  }
  return result;
}

/** Picks up existing and newly promoted pending players without changing their
 * status or requiring someone to open a squad page. No provider is called here. */
export async function runPendingSquadActivationEmailJob() {
  const candidates = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT p."id" FROM "TeamPlayerProspect" p JOIN "Team" t ON t."id" = p."teamId"
    WHERE p."status" = 'ACTIVE_SQUAD' AND t."teamMode" = 'MANAGED'
      AND NULLIF(TRIM(p."email"), '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "NotificationDispatch" d LEFT JOIN "NotificationTemplate" nt ON nt."id" = d."templateId"
        WHERE d."sourceType" = 'TEAM_PLAYER_PROSPECT' AND d."sourceId" = p."id" AND d."channel" = 'EMAIL'
          AND (nt."key" = ${SQUAD_ACTIVATION_EMAIL_KEY} OR d."metadata"->>'templateKey' = ${SQUAD_ACTIVATION_EMAIL_KEY})
      )
      AND NOT EXISTS (
        SELECT 1 FROM "TeamMember" m JOIN "User" u ON u."id" = m."userId"
        LEFT JOIN "TeamMemberProfile" mp ON mp."teamMemberId" = m."id"
        WHERE m."teamId" = p."teamId" AND (LOWER(TRIM(u."email")) = LOWER(TRIM(p."email")) OR mp."sourceProspectId" = p."id")
      )
    ORDER BY p."createdAt", p."id"
  `);
  const summary = { scanned: candidates.length, queued: 0, held: 0, errors: [] as string[] };
  for (const candidate of candidates) {
    try { const result = await queuePendingSquadActivationEmail({ prospectId: candidate.id }); if (result.queued) summary.queued++; else summary.held++; }
    catch (error) { summary.errors.push(`${candidate.id}: ${error instanceof Error ? error.message : "Activation failed"}`); }
  }
  if (summary.errors.length) throw new Error(`Pending squad activation: ${summary.queued} queued; ${summary.errors.length} failed. ${summary.errors.slice(0,10).join("; ")}`);
  return summary;
}

/** Recheck immediately before the shared email provider, including manual
 * retries: no stale invite after account linking, removal, move or opt-out. */
export async function getSquadActivationEmailDeliveryBlock(dispatch: {
  id: string; channel: string; sourceType: string | null; sourceId: string | null; createdAt: Date;
  recipientId: string; recipient: { email: string | null }; metadata: unknown; template: { key: string } | null;
}) {
  const meta = record(dispatch.metadata);
  if (dispatch.channel !== "EMAIL" || (dispatch.template?.key !== SQUAD_ACTIVATION_EMAIL_KEY && meta.templateKey !== SQUAD_ACTIVATION_EMAIL_KEY)) return null;
  if (dispatch.sourceType !== "TEAM_PLAYER_PROSPECT" || !dispatch.sourceId) return "Activation email is missing its pending-player reference.";
  const state = await readEligibility(dispatch.sourceId, prisma, meta.activationMode === "automatic");
  if (!state.eligible || !state.prospect) return state.reason;
  const p = state.prospect;
  if (p.teamId !== meta.teamId) return "Player changed teams after this activation email was queued.";
  const email = normaliseEmail(p.email);
  const recipient = await prisma.notificationRecipient.findUnique({ where: { id: dispatch.recipientId }, include: { preferences: true } });
  if (!recipient || email !== normaliseEmail(dispatch.recipient.email) || email !== normaliseEmail(recipient.email) ||
      (typeof meta.activationEmail === "string" && email !== meta.activationEmail)) return "Player email changed after this activation email was queued.";
  if (recipient.isSuppressed || !recipient.transactionalEmailOptIn || recipient.preferences?.emailEnabled === false) return "Activation email disabled or contact suppressed before delivery.";
  const duplicate = await prisma.notificationDispatch.findFirst({ where: { ...activationWhere(p.id), id: { not: dispatch.id }, AND: [{ OR: [
    { status: { in: ["QUEUED", "PROCESSING"] }, OR: [ { createdAt: { lt: dispatch.createdAt } }, { createdAt: dispatch.createdAt, id: { lt: dispatch.id } } ] },
    { OR: [{ sentAt: { not: null } }, { providerMessageId: { not: null } }, { attempts: { some: { status: "SUCCESS" } } }],
      ...(meta.activationMode === "resend" ? { createdAt: { gte: dispatch.createdAt } } : {}) },
  ] }] }, select: { id: true } });
  return duplicate ? "Another activation email is already pending or sent; duplicate cancelled." : null;
}
