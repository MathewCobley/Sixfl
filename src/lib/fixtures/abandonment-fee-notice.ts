import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import { getFixtureAbandonmentReasonLabel } from "./abandonment";

export const FEES_UNCHANGED_ABANDONMENT_TEMPLATE = "fixture-abandonment-fees-unchanged-email";

/** Initial delivery and explicit resends both read the saved fee decision.
 * Never fall back to the ordinary double-charge/waiver emails on a failure. */
export async function queueFeesUnchangedAbandonmentEmails(input: {
  fixtureId: string;
  createdByUserId: string;
  resend?: boolean;
}) {
  const dispatchIds: string[] = [];
  const failures: string[] = [];
  try {
    const rows = await prisma.$queryRaw<Array<{ feeDecision: string; reason: string }>>(Prisma.sql`
      SELECT "feeDecision", "reason" FROM "FixtureAbandonment" WHERE "fixtureId" = ${input.fixtureId}
    `);
    if (rows[0]?.feeDecision !== "UNCHANGED") throw new Error("No unchanged-fee abandonment decision is recorded.");
    const fixture = await prisma.fixture.findUnique({ where: { id: input.fixtureId }, select: {
      id: true,
      homeTeam: { select: { id: true, name: true, logoUrl: true } },
      awayTeam: { select: { id: true, name: true, logoUrl: true } },
      result: { select: { homeScore: true, awayScore: true } },
    } });
    if (!fixture) throw new Error("Fixture not found.");
    const fixtureLabel = `${fixture.homeTeam.name} v ${fixture.awayTeam.name}`;
    const resultSummary = fixture.result
      ? `${fixture.homeTeam.name} ${fixture.result.homeScore}–${fixture.result.awayScore} ${fixture.awayTeam.name}`
      : "Pending SIXFL decision";
    for (const team of [fixture.homeTeam, fixture.awayTeam]) {
      try {
        const { recipient, snapshot } = await upsertTeamNotificationRecipient(team.id);
        const dispatch = await queueNotificationFromTemplate({
          templateKey: FEES_UNCHANGED_ABANDONMENT_TEMPLATE,
          recipientId: recipient.id,
          variables: {
            firstName: snapshot.primaryContact.name?.trim().split(/\s+/)[0] || "there",
            teamName: team.name,
            fixtureLabel,
            outcomeLabel: rows[0].reason === "NO_SHOW" ? "Confirmed team no-show" : "Referee abandonment",
            reasonLabel: getFixtureAbandonmentReasonLabel(rows[0].reason),
            resultSummary,
          },
          sourceType: "TEAM",
          sourceId: team.id,
          metadata: { origin: "fixture-abandonment-fees-unchanged", originLabel: "Abandoned match — fees unchanged",
            fixtureId: fixture.id, teamId: team.id, feeDecision: "UNCHANGED", recoveryResend: Boolean(input.resend) },
          emailBranding: { teamName: team.name, teamLogoUrl: team.logoUrl, leagueName: snapshot.leagueName || null },
          createdByUserId: input.createdByUserId,
        });
        if (["QUEUED", "PROCESSING", "SENT"].includes(dispatch.status)) dispatchIds.push(dispatch.id);
        else failures.push(`${team.id}: ${dispatch.failureReason || dispatch.status}`);
        try { await logNotificationDispatchToThread({ dispatch, recipient }); }
        catch (error) { console.error("Saved abandonment email could not be logged to its thread", error); }
      } catch (error) {
        failures.push(`${team.id}: ${error instanceof Error ? error.message : "Unable to queue notice"}`);
      }
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : "Unable to load saved decision");
  }
  if (failures.length) console.error("Abandonment saved; unchanged-fee notifications need review", failures);
  return { dispatchIds, failures };
}
