"use server";

import {
  LeadStatus,
  NotificationAudience,
  NotificationChannel,
  NotificationDispatchStatus,
  NotificationRecipientSourceType,
  NotificationTemplateKind,
  Prisma,
} from "@prisma/client";
import { revalidatePath } from "next/cache";

import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import { ensureTeamPlaceConfirmationRecord } from "@/lib/leads/teamPlaceConfirmation";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

// A module-level "use server" file may only export async server actions.
// Keep implementation constants private so Next.js can expose the action.
const TEAM_REASSURANCE_TEMPLATE_KEY = "team-lead-reassurance-email";
const TEAM_REASSURANCE_SOURCE_TYPE = "LEAD_REASSURANCE_EMAIL";
const TEAM_REASSURANCE_SMS_TEMPLATE_KEY = "team-lead-reassurance-sms";
const TEAM_REASSURANCE_SMS_SOURCE_TYPE = "LEAD_REASSURANCE_SMS";

const DEFAULT_SUBJECT = "Everything you need to know about joining SIXFL ⚽";
const DEFAULT_CTA_LABEL = "YES — I WANT TO ENTER A TEAM";
const DEFAULT_SMS_BODY =
  "Hi {{firstName}}, it’s SIXFL. We’ve just emailed you the full details for {{leagueName}}, including the costs and a short team confirmation link. Please check your junk or spam folder if you can’t see it. Thanks, SIXFL";

const DEFAULT_BODY = `Hi {{firstName}},

Thanks for your interest in joining SIXFL {{leagueName}} ⚽

If you’re thinking about entering a team, here’s everything you need to know. We’ve tried to make getting started as simple as possible.

⚽ YOUR SIXFL LEAGUE

📍 Venue: {{venueName}}
🕐 Kick-offs: {{kickoffInfo}}
🏁 Planned start: {{proposedStartDate}}
💷 Cost: {{costPerTeamPerMatch}} per team, per match

That’s the team price, not per player.

For example, at £40 with 8 players, that works out at just £5 each for the match.

🏆 WHAT DO YOU GET?

SIXFL is designed to feel like a proper football league rather than just turning up for a casual game.

✅ Regular organised league fixtures
✅ Referees and match-night management
✅ Live league tables, fixtures and results
✅ Your own team and player accounts
✅ Team statistics and match information
✅ SIXFL AI match predictions
✅ Games recorded and displayed on YouTube

6-a-side football. Done properly.

👥 HOW MANY PLAYERS DO I NEED?

Matches are 6-a-side.

You can use up to 9 players on a match night:

6 players + up to 3 rolling substitutes

Your overall squad can be bigger than nine — you simply choose which players are playing each fixture.

Don’t have every player confirmed yet?

That’s OK.

You can still get your team started while you organise the rest of your squad.

🚀 HOW GETTING STARTED WORKS

1️⃣ Confirm you want to enter
We already have your contact details from your enquiry, so there is no need to fill them in again.

2️⃣ Tell us your team name
If you have decided it, add it now. If not, you can confirm it later.

3️⃣ We get the league ready
As teams commit, we confirm the league, venue, start date and match-night details.

4️⃣ Start playing
Once the league launches, your fixtures, results and league table are all managed through SIXFL.

💷 WHAT DO I PAY — AND AM I TIED IN?

The standard match fee is {{costPerTeamPerMatch}} per team for each weekly fixture.

Simply confirming you want to enter does not mean you are suddenly being charged match fees.

There’s no long-term contract tying your team in. You pay for your football as you play.

We also know that running an amateur football team means there will occasionally be weeks when you simply can’t get a team together — holidays, work commitments and other plans happen.

If you know in advance that your team can’t play on a particular week, let us know and we’ll do our best to work around it when arranging the fixtures.

The more notice you can give us, the easier it is for us to accommodate.

You can also tell us about a one-off time restriction — for example, if your team can play one week but only after 8pm.

We organise the league to make regular football easy to fit around real life, not to tie teams into something they can’t manage.

🏆 INTERESTED, BUT NOT QUITE READY?

You do not need to have everything organised today.

Maybe you:
• still need another player or two
• need to check with your mates
• haven’t decided on a team name
• want to know a little more about the league first

That’s completely fine.

When you are ready to move forward, use the button below. We already have your details — it is simply your way of telling us you want to enter a team.

{{cta}}

GOT A QUESTION?

Just reply to this email.

We’re happy to help and there’s no need to figure everything out on your own.

See you on the pitch,

SIXFL

6-a-side football. Done properly.`;

type LeagueDetailsRow = {
  proposedStartDate: Date | null;
  minutesPerGame: number | null;
  costPerTeamPerMatchPence: number | null;
  targetTeamCount: number | null;
};

type ReassuranceSmsStatus =
  | NotificationDispatchStatus
  | "NO_PHONE"
  | "EMAIL_NOT_QUEUED"
  | "FAILED_TO_QUEUE";

function getFirstName(value: string | null | undefined) {
  return value?.trim().split(/\s+/)[0] || "there";
}

function formatLongDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(value);
}

function formatCurrencyPence(value: number | null) {
  if (value === null) return "To be confirmed";

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: value % 100 === 0 ? 0 : 2,
  }).format(value / 100);
}

function formatVenueName(value: string | null | undefined) {
  const venueName = value?.trim();
  if (!venueName || venueName.toUpperCase() === "TBC") return "To be confirmed";
  return venueName;
}

async function ensureReassuranceTemplates() {
  const existingEmail = await prisma.notificationTemplate.findUnique({
    where: { key: TEAM_REASSURANCE_TEMPLATE_KEY },
    select: { ctaLabel: true },
  });

  await Promise.all([
    prisma.notificationTemplate.upsert({
      where: { key: TEAM_REASSURANCE_TEMPLATE_KEY },
      update: {
        kind: NotificationTemplateKind.TRANSACTIONAL,
        channel: NotificationChannel.EMAIL,
        audience: NotificationAudience.LEAD,
        ctaLabel: existingEmail?.ctaLabel?.trim() || DEFAULT_CTA_LABEL,
        // The system mailer supplies the lead-specific decision URL through this
        // supported variable. The recipient is never sent to a blank lead form.
        ctaUrlKey: "signupUrl",
        isActive: true,
      },
      create: {
        key: TEAM_REASSURANCE_TEMPLATE_KEY,
        name: "Team lead reassurance email",
        description:
          "Friendly league starter information for an existing team lead, including costs, squad size, no long-term contract and advance fixture availability.",
        kind: NotificationTemplateKind.TRANSACTIONAL,
        channel: NotificationChannel.EMAIL,
        audience: NotificationAudience.LEAD,
        subject: DEFAULT_SUBJECT,
        body: DEFAULT_BODY,
        ctaLabel: DEFAULT_CTA_LABEL,
        ctaUrlKey: "signupUrl",
        isActive: true,
      },
    }),
    prisma.notificationTemplate.upsert({
      where: { key: TEAM_REASSURANCE_SMS_TEMPLATE_KEY },
      update: {
        kind: NotificationTemplateKind.TRANSACTIONAL,
        channel: NotificationChannel.SMS,
        audience: NotificationAudience.LEAD,
        subject: null,
        ctaLabel: null,
        ctaUrlKey: null,
        isActive: true,
      },
      create: {
        key: TEAM_REASSURANCE_SMS_TEMPLATE_KEY,
        name: "Team lead reassurance SMS",
        description:
          "Automatic SMS sent with the team lead reassurance email, prompting the lead to check their inbox and junk folder.",
        kind: NotificationTemplateKind.TRANSACTIONAL,
        channel: NotificationChannel.SMS,
        audience: NotificationAudience.LEAD,
        subject: null,
        body: DEFAULT_SMS_BODY,
        ctaLabel: null,
        ctaUrlKey: null,
        isActive: true,
      },
    }),
  ]);
}

export async function sendLeadReassuranceEmailAction(formData: FormData) {
  const { user } = await requireAdmin();
  const leadId = String(formData.get("leadId") ?? "").trim();

  if (!leadId) return { ok: false, error: "Missing lead id." };

  const lead = await prisma.interestLead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      interestType: true,
      status: true,
      convertedTeamId: true,
      contactName: true,
      teamName: true,
      email: true,
      phone: true,
      area: true,
      leagueId: true,
      league: {
        select: {
          id: true,
          name: true,
          season: true,
          venueName: true,
          kickoffInfo: true,
          format: true,
          competition: {
            select: {
              currentLeague: {
                select: {
                  id: true,
                  name: true,
                  season: true,
                  venueName: true,
                  kickoffInfo: true,
                  format: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!lead) return { ok: false, error: "Lead not found." };
  if (lead.interestType !== "TEAM") {
    return { ok: false, error: "Only team leads can receive the reassurance email." };
  }
  if (lead.convertedTeamId) {
    return { ok: false, error: "This lead has already been converted into a SIXFL team." };
  }
  if (lead.status === LeadStatus.CLOSED) {
    return { ok: false, error: "This lead is closed. Reopen it before sending another email." };
  }

  const email = lead.email?.trim().toLowerCase();
  if (!email) return { ok: false, error: "This lead does not have an email address." };
  if (!lead.leagueId || !lead.league) {
    return {
      ok: false,
      error: "Set a prospective league on this lead before sending the reassurance email.",
    };
  }

  const effectiveLeague = lead.league.competition?.currentLeague ?? lead.league;
  const detailsRows = await prisma.$queryRaw<LeagueDetailsRow[]>(Prisma.sql`
    SELECT
      "proposedStartDate" AS "proposedStartDate",
      "minutesPerGame"::int AS "minutesPerGame",
      "costPerTeamPerMatchPence"::int AS "costPerTeamPerMatchPence",
      "targetTeamCount"::int AS "targetTeamCount"
    FROM "League"
    WHERE "id" = ${effectiveLeague.id}
    LIMIT 1
  `);
  const details = detailsRows[0] ?? null;
  const leagueName = `${effectiveLeague.name}${
    effectiveLeague.season ? ` · ${effectiveLeague.season}` : ""
  }`;
  const venueName = formatVenueName(effectiveLeague.venueName);
  const kickoffInfo = effectiveLeague.kickoffInfo?.trim() || "To be confirmed";
  const proposedStartDate = details?.proposedStartDate
    ? formatLongDate(details.proposedStartDate)
    : "To be confirmed";
  const costPerTeamPerMatch = formatCurrencyPence(
    details?.costPerTeamPerMatchPence ?? null,
  );
  const secureLink = await ensureTeamPlaceConfirmationRecord(lead.id);

  await ensureReassuranceTemplates();

  const displayName = lead.contactName?.trim() || lead.teamName?.trim() || email;
  const recipient = await upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.LEAD,
    sourceId: lead.id,
    audience: NotificationAudience.LEAD,
    displayName,
    email,
    phone: lead.phone,
    transactionalEmailOptIn: true,
    transactionalSmsOptIn: true,
    marketingEmailOptIn: true,
    metadata: {
      leadId: lead.id,
      leagueId: effectiveLeague.id,
      originalLeadLeagueId: lead.leagueId,
      leagueName,
      teamName: lead.teamName,
      contactName: lead.contactName,
      entityType: "TEAM_LEAD_REASSURANCE",
    },
  });

  const leagueDetailsBlock = [
    `League: ${leagueName}`,
    `Venue: ${venueName}`,
    `Kick-offs: ${kickoffInfo}`,
    `Planned start: ${proposedStartDate}`,
    details?.minutesPerGame ? `Match length: ${details.minutesPerGame} minutes` : null,
    `Cost: ${costPerTeamPerMatch} per team per match`,
    details?.targetTeamCount ? `Number of teams: ${details.targetTeamCount}` : null,
    effectiveLeague.format?.trim()
      ? `Format: ${effectiveLeague.format.trim()}`
      : "Format: Weekly 6-a-side fixtures",
  ]
    .filter(Boolean)
    .join("\n");

  const firstName = getFirstName(lead.contactName);
  const templateVariables = {
    firstName,
    fullName: lead.contactName?.trim() || "",
    contactName: lead.contactName?.trim() || "",
    teamName: lead.teamName?.trim() || "",
    area: lead.area?.trim() || "",
    leagueName,
    venueName,
    kickoffInfo,
    proposedStartDate,
    minutesPerGame: details?.minutesPerGame
      ? String(details.minutesPerGame)
      : "To be confirmed",
    costPerTeamPerMatch,
    targetTeamCount: details?.targetTeamCount
      ? String(details.targetTeamCount)
      : "",
    format: effectiveLeague.format?.trim() || "Weekly 6-a-side fixtures",
    leagueDetails: leagueDetailsBlock,
    leagueDetailsBlock,
    // The system template uses signupUrl as its supported CTA destination,
    // but the value is the secure decision page for this existing lead.
    signupUrl: secureLink.url,
    teamConfirmationUrl: secureLink.url,
  };

  try {
    const emailDispatch = await queueNotificationFromTemplate({
      templateKey: TEAM_REASSURANCE_TEMPLATE_KEY,
      recipientId: recipient.id,
      variables: templateVariables,
      sourceType: TEAM_REASSURANCE_SOURCE_TYPE,
      sourceId: lead.id,
      metadata: {
        origin: "lead_reassurance_email",
        originLabel: "Team lead reassurance email",
        leadId: lead.id,
        leagueId: effectiveLeague.id,
        originalLeadLeagueId: lead.leagueId,
        leagueName,
        teamName: lead.teamName,
        ctaUrl: secureLink.url,
      },
      createdByUserId: user?.id ?? null,
    });

    await logNotificationDispatchToThread({ dispatch: emailDispatch, recipient });
    await prisma.interestLeadEmail.create({
      data: {
        interestLeadId: lead.id,
        subject: emailDispatch.subject ?? DEFAULT_SUBJECT,
        body: emailDispatch.bodyText,
        sentTo: email,
      },
    });

    let smsDispatchId: string | null = null;
    let smsStatus: ReassuranceSmsStatus = "EMAIL_NOT_QUEUED";
    let smsFailureReason: string | null = null;

    if (emailDispatch.status === NotificationDispatchStatus.QUEUED) {
      if (!lead.phone?.trim()) {
        smsStatus = "NO_PHONE";
        smsFailureReason = "This lead does not have a phone number.";
      } else {
        try {
          const smsDispatch = await queueNotificationFromTemplate({
            templateKey: TEAM_REASSURANCE_SMS_TEMPLATE_KEY,
            recipientId: recipient.id,
            variables: {
              firstName,
              leagueName,
            },
            sourceType: TEAM_REASSURANCE_SMS_SOURCE_TYPE,
            sourceId: lead.id,
            metadata: {
              origin: "lead_reassurance_email_follow_up_sms",
              originLabel: "Team lead reassurance SMS",
              leadId: lead.id,
              leagueId: effectiveLeague.id,
              originalLeadLeagueId: lead.leagueId,
              leagueName,
              pairedEmailDispatchId: emailDispatch.id,
            },
            createdByUserId: user?.id ?? null,
          });

          await logNotificationDispatchToThread({ dispatch: smsDispatch, recipient });
          smsDispatchId = smsDispatch.id;
          smsStatus = smsDispatch.status;
          smsFailureReason = smsDispatch.failureReason ?? null;
        } catch (error) {
          console.error("Reassurance email was queued but its automatic SMS could not be queued", {
            leadId: lead.id,
            error,
          });
          smsStatus = "FAILED_TO_QUEUE";
          smsFailureReason =
            error instanceof Error
              ? error.message
              : "The automatic follow-up SMS could not be queued.";
        }
      }
    } else {
      smsFailureReason =
        emailDispatch.failureReason ||
        "The reassurance email was not queued, so the accompanying SMS was not sent.";
    }

    if (lead.status === LeadStatus.NEW) {
      await prisma.interestLead.update({
        where: { id: lead.id },
        data: { status: LeadStatus.CONTACTED, contactedAt: new Date() },
      });
    }

    revalidatePath("/admin/leads");
    revalidatePath(`/admin/leads/${lead.id}`);
    revalidatePath("/admin/templates");
    revalidatePath("/admin/messaging");

    return {
      ok: true,
      dispatchId: emailDispatch.id,
      status: emailDispatch.status,
      smsDispatchId,
      smsStatus,
      smsFailureReason,
    };
  } catch (error) {
    console.error("sendLeadReassuranceEmailAction error", error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "The reassurance email could not be queued.",
    };
  }
}
