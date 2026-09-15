import { randomUUID } from "node:crypto";
import {
  NotificationAudience,
  NotificationChannel,
  Prisma,
  type NotificationTemplate,
} from "@prisma/client";

import { getStaticEmailCtaUrl } from "@/lib/email/template-cta";
import { getTeamOperationalEmailContacts } from "@/lib/notifications/team-operational-recipients";
import {
  buildQueuedContentFromTemplate,
  queueDirectNotification,
} from "@/lib/notifications/service";
import { getUnresolvedEmailPlaceholderReason } from "@/lib/notifications/renderer";
import { prisma } from "@/lib/prisma";
import { assertCupAdmin, assertCupOpen, cupTerms, loadCup } from "./invitation-data";
import { CupInvitationError, cupDate, money } from "./invitation-policy";

function baseUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || "https://www.sixfl.co.uk").replace(/\/+$/, "");
}

function hasCupResponseButtons(body: string) {
  const responsePair =
    (body.includes("{{yesResponseUrl}}") && body.includes("{{noResponseUrl}}")) ||
    (body.includes("{{yesUrl}}") && body.includes("{{noUrl}}"));

  return (
    responsePair &&
    body.includes("SIXFL_POLL_OPTIONS_START") &&
    body.includes("SIXFL_POLL_OPTIONS_END")
  );
}

function renderableTemplate(template: {
  id: string;
  key: string;
  name: string;
  description: string | null;
  subject: string | null;
  body: string;
  ctaLabel: string | null;
  ctaUrlKey: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): NotificationTemplate {
  return {
    id: template.id,
    key: template.key,
    name: template.name,
    description: template.description,
    kind: "TRANSACTIONAL",
    channel: "EMAIL",
    audience: "TEAM",
    subject: template.subject,
    body: template.body,
    ctaLabel: template.ctaLabel,
    ctaUrlKey: template.ctaUrlKey,
    isActive: template.isActive,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

function testVariables(input: {
  terms: ReturnType<typeof cupTerms>;
  teamName: string;
  contactName: string;
}) {
  const testResponseUrl = `${baseUrl()}/cup-interest/test-response`;
  const yesUrl = `${testResponseUrl}?answer=YES`;
  const noUrl = `${testResponseUrl}?answer=NO`;

  return {
    ...input.terms,
    matchFee: money(input.terms.matchFeePence),
    teamName: input.teamName,
    firstName: input.contactName.trim().split(/\s+/)[0] || "there",
    responseDeadline: cupDate(input.terms.responseDeadline),
    yesUrl,
    noUrl,
    yesResponseUrl: yesUrl,
    noResponseUrl: noUrl,
  };
}

function directCta(
  template: { ctaLabel: string | null; ctaUrlKey: string | null },
  variables: ReturnType<typeof testVariables>,
) {
  const label = template.ctaLabel?.trim();
  const key = template.ctaUrlKey?.trim();
  if (!label || !key) return undefined;

  const staticUrl = getStaticEmailCtaUrl(key);
  const dynamicUrl = String((variables as Record<string, unknown>)[key] ?? "").trim();
  const url = staticUrl || dynamicUrl;
  return url ? { label, url } : undefined;
}

/**
 * Queue one deliberately non-recording Cup test email to the selected team's
 * primary operational contact. This bypasses Cup eligibility only for the test
 * delivery itself: it never creates a CupInvitation, CupInvitationMessage,
 * entrant, response or Cup audit row.
 */
export async function queueCupTestEmail(input: {
  cupId: string;
  actorId: string;
  teamId: string;
  templateId: string;
}) {
  const actor = await assertCupAdmin(input.actorId);
  const cup = await loadCup(input.cupId);
  assertCupOpen(cup);

  const template = await prisma.emailTemplate.findUnique({
    where: { id: input.templateId },
  });

  if (!template?.isActive || template.audience !== "TEAM") {
    throw new CupInvitationError("Choose an active Team Cup email template for the test.");
  }
  if (!hasCupResponseButtons(template.body)) {
    throw new CupInvitationError(
      "This template does not contain the Cup YES / NO response buttons. Add them in the normal email template builder first.",
    );
  }

  const team = await prisma.team.findUnique({
    where: { id: input.teamId },
    select: { id: true, name: true, logoUrl: true, league: { select: { name: true } } },
  });
  if (!team) throw new CupInvitationError("The selected test team no longer exists.");

  const contacts = await getTeamOperationalEmailContacts(team.id);
  const contact = contacts[0] ?? null;
  if (!contact) {
    throw new CupInvitationError("The selected test team does not have an email contact.");
  }

  const recipient = await prisma.notificationRecipient.upsert({
    where: {
      sourceType_sourceId: {
        sourceType: contact.sourceType,
        sourceId: contact.sourceId,
      },
    },
    update: {
      email: contact.email,
      emailNormalized: contact.email,
      displayName: contact.name,
      lastSyncedAt: new Date(),
    },
    create: {
      sourceType: contact.sourceType,
      sourceId: contact.sourceId,
      audience: NotificationAudience.TEAM,
      email: contact.email,
      emailNormalized: contact.email,
      displayName: contact.name,
    },
  });

  await prisma.notificationPreference.upsert({
    where: { recipientId: recipient.id },
    update: {},
    create: { recipientId: recipient.id },
  });

  const terms = cupTerms(cup);
  const variables = testVariables({ terms, teamName: team.name, contactName: contact.name });
  const preview = buildQueuedContentFromTemplate({
    template: renderableTemplate(template),
    variables,
  });

  if (getUnresolvedEmailPlaceholderReason({ channel: "EMAIL", ...preview })) {
    throw new CupInvitationError(
      "The selected Cup template has unresolved fields. Check it in the normal email template builder.",
    );
  }

  const dispatch = await queueDirectNotification({
    recipientId: recipient.id,
    channel: NotificationChannel.EMAIL,
    audience: NotificationAudience.TEAM,
    subject: template.subject ? `[TEST] ${template.subject}` : "[TEST] SIXFL Cup invitation",
    body: template.body,
    isTransactional: true,
    variables: variables as Prisma.InputJsonValue,
    emailCta: directCta(template, variables),
    sourceType: "CUP_TEST_EMAIL",
    sourceId: randomUUID(),
    metadata: {
      cupTestSend: true,
      cupLeagueId: cup.id,
      teamId: team.id,
      campaignTemplateId: template.id,
      noCupResponseRecorded: true,
    },
    emailBranding: {
      teamName: team.name,
      teamLogoUrl: team.logoUrl,
      leagueName: team.league?.name ?? null,
    },
    createdByUserId: actor.id,
  });

  if (dispatch.status !== "QUEUED") {
    throw new CupInvitationError(
      dispatch.failureReason || "The Cup test email could not be queued.",
    );
  }

  return {
    dispatchId: dispatch.id,
    recipientEmail: contact.email,
    recipientName: contact.name,
  };
}
