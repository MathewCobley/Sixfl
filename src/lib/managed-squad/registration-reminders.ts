import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/notifications/phone";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import { buildProspectEmailContext, getManagedSquadJoinConfirmationUrl } from "./prospectJoinConfirmation";
import {
  HOUR, REGISTRATION_SOURCE, REGISTRATION_INVITE_SOURCE, REGISTRATION_LEGACY_CHASES,
  REGISTRATION_PENDING_STATUSES, nextRegistrationWindow, registrationEnabled,
  registrationMetadata, registrationPlan, registrationTemplateKey,
  type RegistrationHistoryItem, type RegistrationPlan, type RegistrationStage,
} from "./registration-reminder-policy";

type Db = Pick<typeof prisma, "$queryRaw" | "teamPlayerProspect" | "notificationDispatch" | "notificationRecipient" | "notificationPreference" | "notificationTemplate">;
const normalEmail = (value: string | null | undefined) => value?.trim().toLowerCase() || null;
function phoneForms(phone: string | null) {
  if (!phone) return ["not-a-phone"];
  const digits = phone.replace(/\D/g, "");
  return [...new Set([digits, `00${digits}`, ...(digits.startsWith("44") ? [`0${digits.slice(2)}`, digits.slice(2), `440${digits.slice(2)}`] : [])])];
}
function identitySql(emailColumn: Prisma.Sql, phoneColumn: Prisma.Sql, email: string, phones: string[]) {
  return Prisma.sql`(LOWER(TRIM(COALESCE(${emailColumn}, ''))) = ${email}
    OR REGEXP_REPLACE(COALESCE(${phoneColumn}, ''), '[^0-9]', '', 'g') IN (${Prisma.join(phones)}))`;
}
const prospectSelect = {
  id: true, firstName: true, lastName: true, email: true, phone: true, status: true,
  teamId: true, lastContactedAt: true,
  team: { select: { id: true, name: true, teamMode: true, logoUrl: true,
    league: { select: { id: true, name: true, season: true, area: true, dayOfWeek: true, venueName: true, isActive: true } },
  } },
} as const;

/** Read-only: used unchanged for preview, scheduling and the last provider gate.
 * excludeDispatchId lets the provider validate its claimed row, not mistake it
 * for a new reminder. Existing accounts/prospects/consent are never changed. */
export async function inspectRegistrationReminder(prospectId: string, db: Db = prisma, excludeDispatchId?: string) {
  const prospect = await db.teamPlayerProspect.findUnique({ where: { id: prospectId }, select: prospectSelect });
  const email = normalEmail(prospect?.email);
  const phone = normalizePhoneNumber(prospect?.phone);
  let blockedReason: string | null = !registrationEnabled() ? "Automatic registration reminders are disabled." : null;
  if (!prospect?.teamId || !prospect.team || prospect.team.teamMode !== "MANAGED") blockedReason = "Prospect is not allocated to a managed squad.";
  else if (!REGISTRATION_PENDING_STATUSES.includes(prospect.status)) blockedReason = "Player has joined, declined or left the pending recruitment pipeline.";
  else if (prospect.team.league?.isActive === false) blockedReason = "The team's league is inactive.";
  else if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) blockedReason = "Save a valid email first; the squad activation link requires it.";
  if (blockedReason || !prospect || !email) return {
    prospect, email, phone, history: [] as RegistrationHistoryItem[], inviteSentAt: null as Date | null,
    plan: registrationPlan({ inviteSentAt: null, history: [], emailAllowed: false, smsAllowed: false, lastManualContactAt: null, pendingContact: false, blockedReason }),
  };
  const teamId = prospect.teamId!;
  const phones = phoneForms(phone);
  const relatedIds = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT r.id FROM "NotificationRecipient" r WHERE
      (r."sourceType" = 'GENERAL' AND r."sourceId" = ${`team-prospect:${prospectId}`})
      OR ${identitySql(Prisma.sql`r.email`, Prisma.sql`r.phone`, email, phones)}
      OR r."emailNormalized" = ${email} OR (${phone}::text IS NOT NULL AND r."phoneNormalized" = ${phone})
  `);
  const [recipients, ownDispatches, duplicate, member] = await Promise.all([
    db.notificationRecipient.findMany({ where: { id: { in: relatedIds.map((r) => r.id) } }, include: { preferences: true } }),
    db.notificationDispatch.findMany({
      where: { sourceId: prospectId, ...(excludeDispatchId ? { id: { not: excludeDispatchId } } : {}),
        sourceType: { in: [REGISTRATION_INVITE_SOURCE, REGISTRATION_SOURCE, ...REGISTRATION_LEGACY_CHASES] } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT p.id FROM "TeamPlayerProspect" p JOIN "Team" t ON t.id = p."teamId"
      WHERE p.id <> ${prospectId} AND t."teamMode" = 'MANAGED'
        AND p.status IN (${Prisma.join(REGISTRATION_PENDING_STATUSES)})
        AND ${identitySql(Prisma.sql`p.email`, Prisma.sql`p.phone`, email, phones)} LIMIT 1
    `),
    db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT m.id FROM "TeamMember" m JOIN "User" u ON u.id = m."userId"
      WHERE m."teamId" = ${teamId} AND LOWER(TRIM(u.email)) = ${email} LIMIT 1
    `),
  ]);
  if (duplicate.length) blockedReason = "Duplicate pending contact records: review before automatically messaging this person.";
  if (member.length) blockedReason = "An account with this email is already in this squad; review rather than chase or merge.";
  if (recipients.some((r) => r.isSuppressed)) blockedReason = "This contact has opted out or is suppressed. Automatic reminders stopped.";
  const emailAllowed = recipients.every((r) => r.transactionalEmailOptIn && r.preferences?.emailEnabled !== false);
  const smsAllowed = Boolean(phone) && recipients.every((r) => r.transactionalSmsOptIn && r.preferences?.smsEnabled !== false);
  const teamDispatches = ownDispatches.filter((d) => registrationMetadata(d.metadata).teamId === teamId);
  const invites = teamDispatches.filter((d) => d.sourceType === REGISTRATION_INVITE_SOURCE && d.status === "SENT" && d.sentAt);
  const inviteSentAt = invites.reduce<Date | null>((latest, d) => !latest || d.sentAt! > latest ? d.sentAt : latest, null);
  // Automatic stage records survive subsequent manual invitations. Otherwise a
  // re-invite could restart the sequence or collide with its unique stage key.
  const history: RegistrationHistoryItem[] = teamDispatches.filter((d) => d.sourceType === REGISTRATION_SOURCE ||
    REGISTRATION_LEGACY_CHASES.includes(d.sourceType || ""));
  let pendingContact = false;
  let lastManualContactAt: Date | null = null;
  if (inviteSentAt) {
    const contactIds = recipients.map((r) => r.id);
    const [contacts, inbound, interestReplies, outbound] = await Promise.all([
      db.notificationDispatch.findMany({ where: { ...(excludeDispatchId ? { id: { not: excludeDispatchId } } : {}),
        OR: [{ sourceId: prospectId }, { recipientId: { in: contactIds } }],
        status: { in: ["QUEUED", "PROCESSING", "SENT"] } },
        select: { id: true, sourceType: true, status: true, sentAt: true } }),
      db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT e.id FROM "MessageEntry" e JOIN "MessageThread" t ON t.id = e."threadId"
        WHERE e.direction = 'INBOUND' AND COALESCE(e."receivedAt", e."createdAt") >= ${inviteSentAt}
          AND (${identitySql(Prisma.sql`e."fromEmail"`, Prisma.sql`e."fromNumber"`, email, phones)}
            OR t."recipientId" IN (${Prisma.join(contactIds.length ? contactIds : ["no-recipient"] )})
            OR t."sourceId" IN (${prospectId}, ${`team-prospect:${prospectId}`})) LIMIT 1
      `),
      db.$queryRaw<Array<{ response: string; respondedAt: Date }>>(Prisma.sql`
        SELECT response, "respondedAt" FROM "PlayerInterestResponse"
        WHERE "prospectId" = ${prospectId} AND ("teamId" = ${teamId} OR "teamId" IS NULL)
        ORDER BY "respondedAt" DESC LIMIT 1
      `),
      db.$queryRaw<Array<{ sentAt: Date }>>(Prisma.sql`
        SELECT MAX(e."sentAt") AS "sentAt" FROM "MessageEntry" e
        JOIN "MessageThread" t ON t.id = e."threadId"
        LEFT JOIN "NotificationDispatch" d ON d.id = e."notificationDispatchId"
        WHERE e.direction = 'OUTBOUND' AND e."sentAt" > ${inviteSentAt}
          AND (d.id IS NULL OR d."sourceType" IS DISTINCT FROM ${REGISTRATION_SOURCE})
          AND (d.id IS NULL OR d."sourceType" IS DISTINCT FROM ${REGISTRATION_INVITE_SOURCE})
          AND (${identitySql(Prisma.sql`e."toEmail"`, Prisma.sql`e."toNumber"`, email, phones)}
            OR t."recipientId" IN (${Prisma.join(contactIds.length ? contactIds : ["no-recipient"] )})
            OR t."sourceId" IN (${prospectId}, ${`team-prospect:${prospectId}`}))
      `),
    ]);
    if (inbound.length || interestReplies.some((r) => r.response === "NO" || r.respondedAt >= inviteSentAt)) {
      blockedReason = "A reply has been received. Automatic reminders paused for a person to follow up.";
    }
    pendingContact = contacts.some((d) => d.status === "QUEUED" || d.status === "PROCESSING");
    const manualTimes = [prospect.lastContactedAt, outbound[0]?.sentAt,
      ...contacts.filter((d) => d.sourceType !== REGISTRATION_SOURCE && d.sourceType !== REGISTRATION_INVITE_SOURCE).map((d) => d.sentAt)]
      .filter((d): d is Date => Boolean(d && d > inviteSentAt));
    if (manualTimes.length) lastManualContactAt = new Date(Math.max(...manualTimes.map((d) => d.getTime())));
  }
  const plan = registrationPlan({ inviteSentAt, history, emailAllowed, smsAllowed, lastManualContactAt, pendingContact, blockedReason });
  if (plan.stage && plan.channel) {
    const template = await db.notificationTemplate.findUnique({ where: { key: registrationTemplateKey(plan.stage, plan.channel) } });
    if (!template?.isActive || template.channel !== plan.channel || template.kind !== "TRANSACTIONAL" || template.audience !== "PLAYER") {
      plan.state = "review"; plan.note = "The reminder template is missing, disabled or has incompatible settings."; plan.dueAt = null;
    }
  }
  return { prospect, email, phone, history, inviteSentAt, plan };
}

/** Row lock + unique prospect/team/stage index serialize simultaneous cron runs.
 * No provider calls, account creation or consent changes occur in this transaction. */
export async function queueDueRegistrationReminder(prospectId: string, now = new Date()) {
  if (!registrationEnabled() || nextRegistrationWindow(now).getTime() !== now.getTime()) return null;
  return prisma.$transaction(async (db) => {
    await db.$queryRaw(Prisma.sql`SELECT id FROM "TeamPlayerProspect" WHERE id = ${prospectId} FOR UPDATE`);
    const view = await inspectRegistrationReminder(prospectId, db);
    const { prospect, plan } = view;
    if (!prospect?.team || !prospect.teamId || plan.state !== "scheduled" || !plan.dueAt || plan.dueAt > now || !plan.stage || !plan.channel) return null;
    const context = await buildProspectEmailContext(prospect);
    if (!context) return null;
    const contact = { displayName: context.displayName, email: view.email, emailNormalized: view.email,
      phone: view.phone, phoneNormalized: view.phone, lastSyncedAt: now };
    const recipient = await db.notificationRecipient.upsert({
      where: { sourceType_sourceId: { sourceType: "GENERAL", sourceId: `team-prospect:${prospectId}` } },
      update: contact, // Never re-enable opt-outs, suppression or preferences.
      create: { ...contact, sourceType: "GENERAL", sourceId: `team-prospect:${prospectId}`, audience: "PLAYER",
        marketingEmailOptIn: false, marketingSmsOptIn: false,
        metadata: { teamId: prospect.teamId, prospectId, entityType: "TEAM_PLAYER_PROSPECT" } },
    });
    await db.notificationPreference.upsert({ where: { recipientId: recipient.id }, update: {}, create: { recipientId: recipient.id } });
    const templateKey = registrationTemplateKey(plan.stage, plan.channel);
    const dispatch = await queueNotificationFromTemplate({
      templateKey, recipientId: recipient.id, sourceType: REGISTRATION_SOURCE, sourceId: prospectId,
      variables: context.variables, scheduledFor: now,
      metadata: { automatic: true, stage: plan.stage, teamId: prospect.teamId, prospectId,
        contactName: context.displayName, contactEmail: view.email, contactPhone: view.phone,
        origin: "managed_squad_registration_reminder", originLabel: "Automatic squad registration reminder",
        templateKey, joinConfirmationUrl: context.joinConfirmationUrl },
      emailBranding: { teamName: prospect.team.name, teamLogoUrl: prospect.team.logoUrl, leagueName: context.leagueName },
    }, db);
    return { dispatch, recipient, stage: plan.stage };
  }, { maxWait: 5000, timeout: 20000 });
}

type DeliveryDispatch = {
  id: string; sourceType: string | null; sourceId: string | null; channel: string;
  recipientId: string; metadata: unknown; variables: unknown; templateId: string | null;
};
export type RegistrationDeliveryDecision = { reason: string; deferUntil?: Date };
export async function registrationDeliveryDecision(dispatch: DeliveryDispatch, now = new Date()): Promise<RegistrationDeliveryDecision | null> {
  if (dispatch.sourceType !== REGISTRATION_SOURCE) return null;
  const meta = registrationMetadata(dispatch.metadata);
  if (!dispatch.sourceId || ![1, 2, 3].includes(Number(meta.stage))) return { reason: "Invalid registration reminder reference." };
  const view = await inspectRegistrationReminder(dispatch.sourceId, prisma, dispatch.id);
  if (!view.prospect?.teamId || view.prospect.teamId !== meta.teamId) return { reason: "Prospect moved or was removed; stale registration reminder cancelled." };
  const recipient = await prisma.notificationRecipient.findUnique({ where: { id: dispatch.recipientId }, include: { preferences: true } });
  if (!recipient || recipient.isSuppressed || normalEmail(recipient.email) !== view.email || meta.contactEmail !== view.email ||
    (dispatch.channel === "EMAIL" && (!recipient.transactionalEmailOptIn || recipient.preferences?.emailEnabled === false)) ||
    (dispatch.channel === "SMS" && (!recipient.transactionalSmsOptIn || recipient.preferences?.smsEnabled === false ||
      !view.phone || normalizePhoneNumber(recipient.phone) !== view.phone || meta.contactPhone !== view.phone))) {
    return { reason: "Contact or notification permission changed; registration reminder cancelled." };
  }
  const vars = registrationMetadata(dispatch.variables);
  if (vars.joinConfirmationUrl !== getManagedSquadJoinConfirmationUrl(dispatch.sourceId)) return { reason: "Stale or invalid squad activation link." };
  const stage = Number(meta.stage) as RegistrationStage;
  const template = dispatch.templateId ? await prisma.notificationTemplate.findUnique({ where: { id: dispatch.templateId } }) : null;
  if (!template?.isActive || template.key !== registrationTemplateKey(stage, dispatch.channel === "SMS" ? "SMS" : "EMAIL") ||
    template.channel !== dispatch.channel || template.kind !== "TRANSACTIONAL" || template.audience !== "PLAYER") {
    return { reason: "Registration reminder template is disabled or changed." };
  }
  if (view.plan.state === "waiting" && view.inviteSentAt) {
    return { reason: view.plan.note, deferUntil: nextRegistrationWindow(new Date(now.getTime() + HOUR)) };
  }
  if (view.plan.state !== "scheduled" || view.plan.stage !== stage || view.plan.channel !== dispatch.channel) return { reason: view.plan.note };
  const dueAt = nextRegistrationWindow(new Date(Math.max(now.getTime(), view.plan.dueAt!.getTime())));
  if (dueAt > now) return { reason: "Registration reminder postponed for spacing or UK quiet hours.", deferUntil: dueAt };
  return null;
}

/** Run immediately before each provider (email as well as SMS). Only our claimed,
 * unsent row may be deferred/cancelled; provider-accepted records are untouched. */
export async function applyRegistrationDeliveryGate(dispatch: DeliveryDispatch, now = new Date()) {
  const decision = await registrationDeliveryDecision(dispatch, now);
  if (!decision) return null;
  await prisma.notificationDispatch.updateMany({
    where: { id: dispatch.id, sourceType: REGISTRATION_SOURCE, status: "PROCESSING", sentAt: null, providerMessageId: null },
    data: decision.deferUntil
      ? { status: "QUEUED", processedAt: null, scheduledFor: decision.deferUntil, failureReason: decision.reason }
      : { status: "CANCELLED", cancelledAt: now, failureReason: decision.reason },
  });
  return decision.reason;
}

export async function runManagedSquadRegistrationReminderJob(now = new Date()) {
  const summary = { enabled: registrationEnabled(), quietHours: nextRegistrationWindow(now) > now, scanned: 0, queued: 0, emailQueued: 0, smsQueued: 0, held: 0, errors: [] as string[] };
  if (!summary.enabled || summary.quietHours) {
    console.info("[managed-squad-registration]", JSON.stringify(summary));
    return summary;
  }
  let cursor: string | undefined;
  do {
    const page = await prisma.teamPlayerProspect.findMany({
      where: { status: { in: REGISTRATION_PENDING_STATUSES }, team: { teamMode: "MANAGED" } },
      select: { id: true }, orderBy: { id: "asc" }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!page.length) break;
    for (const row of page) {
      summary.scanned++;
      try {
        const result = await queueDueRegistrationReminder(row.id, now);
        if (!result || result.dispatch.status !== "QUEUED") { summary.held++; continue; }
        summary.queued++;
        if (result.dispatch.channel === "SMS") summary.smsQueued++; else summary.emailQueued++;
        // Outbox committed first: a history logging failure never queues another send.
        await logNotificationDispatchToThread(result);
      } catch (error) {
        if (summary.errors.length < 20) summary.errors.push(`${row.id}: ${error instanceof Error ? error.message : "Registration reminder failed"}`);
      }
      if (summary.queued >= 25) break;
    }
    cursor = page[page.length - 1].id;
    if (page.length < 100) break;
  } while (summary.queued < 25);
  console.info("[managed-squad-registration]", JSON.stringify(summary));
  return summary;
}

export type RegistrationOverviewRow = { id: string; name: string; plan: RegistrationPlan; inviteSentAt: Date | null; history: RegistrationHistoryItem[] };
export async function getRegistrationReminderOverview(teamId: string): Promise<RegistrationOverviewRow[]> {
  const prospects = await prisma.teamPlayerProspect.findMany({ where: { teamId, team: { teamMode: "MANAGED" }, status: { in: REGISTRATION_PENDING_STATUSES } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, firstName: true, lastName: true } });
  const rows: RegistrationOverviewRow[] = [];
  // Bounded read concurrency; never queue messages while rendering a page.
  for (let i = 0; i < prospects.length; i += 4) {
    const batch = await Promise.all(prospects.slice(i, i + 4).map(async (p) => {
      const view = await inspectRegistrationReminder(p.id);
      return { id: p.id, name: [p.firstName, p.lastName].filter(Boolean).join(" "), plan: view.plan, inviteSentAt: view.inviteSentAt, history: view.history };
    }));
    rows.push(...batch);
  }
  return rows;
}
