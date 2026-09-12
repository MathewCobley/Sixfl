import { Prisma, NotificationAudience, NotificationChannel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { queueDirectNotification } from "@/lib/notifications/service";
import { upsertTeamOperationalEmailRecipients } from "@/lib/notifications/team-operational-recipients";
import { getPublicSiteUrl } from "@/lib/stripe/client";
import { buildResultOverturnEmail } from "./result-overturn-email-content";

export const RESULT_OVERTURN_EMAIL_SOURCE = "FIXTURE_RESULT_OVERTURN_NOTICE";
export class ResultOverturnEmailError extends Error {}
type Db = Pick<typeof prisma, "user" | "matchResultOverturn" | "fixture">;

async function assertAdmin(db: Db, actorUserId: string) {
  const user = actorUserId ? await db.user.findUnique({
    where: { id: actorUserId }, select: { role: true },
  }) : null;
  if (user?.role !== "ADMIN") throw new ResultOverturnEmailError("Administrator access is required.");
}

/** Explicit selection prevents private review text reaching content, variables or metadata. */
async function loadNotice(fixtureId: string, decisionId: string, actorUserId: string, db: Db = prisma) {
  await assertAdmin(db, actorUserId);
  const decision = await db.matchResultOverturn.findUnique({
    where: { id: decisionId },
    select: {
      id: true, fixtureId: true, homeTeamId: true, awayTeamId: true,
      homeTeamName: true, awayTeamName: true, originalHomeScore: true, originalAwayScore: true,
      awardedHomeScore: true, awardedAwayScore: true, reasonCode: true,
    },
  });
  if (!decision || decision.fixtureId !== fixtureId) {
    throw new ResultOverturnEmailError("No recorded overturn decision was found for this fixture.");
  }
  const fixture = await db.fixture.findUnique({
    where: { id: fixtureId },
    select: {
      id: true, homeTeamId: true, awayTeamId: true, kickoffAt: true, leagueId: true,
      publishedAt: true, status: true,
      league: { select: { slug: true } },
      result: { select: { homeScore: true, awayScore: true } },
    },
  });
  if (!fixture || !fixture.publishedAt || fixture.status !== "COMPLETED" || fixture.homeTeamId !== decision.homeTeamId || fixture.awayTeamId !== decision.awayTeamId ||
      fixture.result?.homeScore !== decision.awardedHomeScore || fixture.result?.awayScore !== decision.awardedAwayScore) {
    throw new ResultOverturnEmailError("The fixture no longer matches the recorded decision. Review it before notifying the teams.");
  }
  const content = buildResultOverturnEmail({
    homeTeamName: decision.homeTeamName, awayTeamName: decision.awayTeamName,
    originalHomeScore: decision.originalHomeScore, originalAwayScore: decision.originalAwayScore,
    awardedHomeScore: decision.awardedHomeScore, awardedAwayScore: decision.awardedAwayScore,
    reasonCode: decision.reasonCode, kickoffAt: fixture.kickoffAt,
  });
  return { decision, fixture, content };
}

export type OverturnEmailRecord = {
  id: string; status: string; sentAt: Date | null; email: string; teamName: string;
};

/** Read-only preview/status: refreshing the page must never send or update contacts. */
export async function getResultOverturnEmailPanel(fixtureId: string, decisionId: string, actorUserId: string) {
  const notice = await loadNotice(fixtureId, decisionId, actorUserId);
  const dispatches = await prisma.notificationDispatch.findMany({
    where: { sourceType: RESULT_OVERTURN_EMAIL_SOURCE, sourceId: decisionId, channel: "EMAIL" },
    orderBy: { createdAt: "asc" },
    select: { id: true, status: true, sentAt: true, metadata: true },
  });
  const records: OverturnEmailRecord[] = dispatches.map((dispatch) => {
    const metadata = dispatch.metadata && typeof dispatch.metadata === "object" && !Array.isArray(dispatch.metadata)
      ? dispatch.metadata : {};
    return {
      id: dispatch.id, status: dispatch.status, sentAt: dispatch.sentAt,
      email: typeof metadata.emailNormalized === "string" ? metadata.emailNormalized : "Recorded contact",
      teamName: typeof metadata.teamName === "string" ? metadata.teamName : "Team captain",
    };
  });
  return {
    subject: notice.content.subject, body: notice.content.body, records,
    teamNames: [notice.decision.homeTeamName, notice.decision.awayTeamName],
  };
}

/** Explicit administrator request only. Queue rows are atomic and duplicate-safe.
 * The normal email worker handles delivery; do not drain unrelated messages here. */
export async function queueResultOverturnEmails(input: {
  fixtureId: string; decisionId: string; actorUserId: string; confirmed: boolean;
}) {
  await loadNotice(input.fixtureId, input.decisionId, input.actorUserId);
  if (!input.confirmed) throw new ResultOverturnEmailError("Review the email and confirm before notifying both teams.");
  return prisma.$transaction(async (tx) => {
    await assertAdmin(tx, input.actorUserId);
    // Serialise contact resolution and queueing, including concurrent first clicks.
    await tx.$queryRaw(Prisma.sql`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${RESULT_OVERTURN_EMAIL_SOURCE}), hashtext(${input.decisionId}))`);
    const current = await loadNotice(input.fixtureId, input.decisionId, input.actorUserId, tx);
    const teams = [
      { id: current.decision.homeTeamId, name: current.decision.homeTeamName },
      { id: current.decision.awayTeamId, name: current.decision.awayTeamName },
    ];
    const recipients = new Map<string, { recipientId: string; teamIds: string[]; teamNames: string[] }>();
    for (const team of teams) {
      const contacts = await upsertTeamOperationalEmailRecipients(team.id);
      const usable = contacts.filter(contact => contact.email?.trim());
      if (!usable.length) throw new ResultOverturnEmailError("A team has no email contact. Update its captain/contact details before notifying both teams.");
      for (const contact of usable) {
        const email = contact.email!.trim().toLowerCase();
        const previous = recipients.get(email);
        if (previous) {
          if (!previous.teamIds.includes(team.id)) { previous.teamIds.push(team.id); previous.teamNames.push(team.name); }
        } else recipients.set(email, { recipientId: contact.id, teamIds: [team.id], teamNames: [team.name] });
      }
    }
    const resultsUrl = `${getPublicSiteUrl().replace(/\/$/, "")}/leagues/${encodeURIComponent(current.fixture.league.slug)}/results`;
    const existing = await tx.notificationDispatch.findMany({
      where: { sourceType: RESULT_OVERTURN_EMAIL_SOURCE, sourceId: input.decisionId, channel: "EMAIL" },
      select: { metadata: true },
    });
    const recorded = new Set(existing.flatMap((row) => {
      const metadata = row.metadata;
      return metadata && typeof metadata === "object" && !Array.isArray(metadata) && typeof metadata.emailNormalized === "string"
        ? [metadata.emailNormalized] : [];
    }));
    let created = 0;
    for (const [email, person] of recipients) {
      // Even FAILED / SKIPPED / CANCELLED records require explicit queue review,
      // never an accidental second email from retrying this button.
      if (recorded.has(email)) continue;
      const recipient = await tx.notificationRecipient.findUnique({
        where: { id: person.recipientId }, select: { email: true },
      });
      if (recipient?.email?.trim().toLowerCase() !== email) {
        throw new ResultOverturnEmailError("A captain contact changed. Refresh the page before retrying.");
      }
      await queueDirectNotification({
        recipientId: person.recipientId, channel: NotificationChannel.EMAIL, audience: NotificationAudience.TEAM,
        subject: current.content.subject, body: current.content.body, isTransactional: true,
        sourceType: RESULT_OVERTURN_EMAIL_SOURCE, sourceId: input.decisionId,
        emailCta: { label: "View league results", url: resultsUrl },
        metadata: {
          origin: "result-overturn-notice", originLabel: "Overturned result update",
          fixtureId: input.fixtureId, decisionId: input.decisionId,
          teamId: person.teamIds[0], teamIds: person.teamIds, teamName: person.teamNames.join(" / "),
          leagueId: current.fixture.leagueId, emailNormalized: email,
        },
        createdByUserId: input.actorUserId,
      }, tx);
      created += 1;
    }
    return { created, recipientCount: recipients.size };
  }, { maxWait: 10_000, timeout: 30_000 });
}
