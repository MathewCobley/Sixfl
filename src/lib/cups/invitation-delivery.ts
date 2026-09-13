import { prisma } from "@/lib/prisma";
import { getTeamOperationalEmailContacts } from "@/lib/notifications/team-operational-recipients";
import { assertCupOpen, cupTerms, eligibleCupTeams, isCupEntrant, loadCup, loadInvitation } from "./invitation-data";
import { CUP_MAIL_SOURCES, CupInvitationError } from "./invitation-policy";
/** Shared worker gate: applies to cron, manual processing and retried dispatches. */
export async function cupInvitationDeliveryBlock(input:{sourceType:string|null;sourceId:string|null;recipientId:string;channel:string}) {
  if(!(CUP_MAIL_SOURCES as readonly (string|null)[]).includes(input.sourceType))return null;
  try {
    if(input.channel!=="EMAIL")return "Cup invitations are email only.";
    const rows=await prisma.$queryRaw<Array<{cupLeagueId:string;teamId:string;settingsVersion:number;recipientEmail:string;recipientId:string}>>`
      SELECT i."cupLeagueId",i."teamId",m."settingsVersion",m."recipientEmail",m."recipientId" FROM "CupInvitationMessage" m
      JOIN "CupInvitation" i ON i.id=m."invitationId" WHERE m.id=${input.sourceId}`;
    const m=rows[0];if(!m || m.recipientId!==input.recipientId)return "Cup invitation recipient is no longer valid.";
    const cup=await loadCup(m.cupLeagueId);assertCupOpen(cup);
    const i=await loadInvitation(m.cupLeagueId,m.teamId);
    if(!i || i.response!=="PENDING" || i.settingsVersion!==m.settingsVersion || m.settingsVersion!==cup.settings!.version)return "Team has responded or the cup invitation has been replaced.";
    const terms=cupTerms(cup);
    if(Object.keys(terms).some(k=>terms[k as keyof typeof terms]!==i.terms[k as keyof typeof terms]))return "Cup details changed after the invitation was queued.";
    if(await isCupEntrant(cup.id,m.teamId))return "Team is already a confirmed entrant.";
    const withdrawn=await prisma.$queryRaw<Array<{id:string}>>`SELECT id FROM "LeagueSeasonTeam" WHERE "leagueId"=${cup.id} AND "teamId"=${m.teamId} AND "isActive"=false`;
    if(withdrawn.length || !(await eligibleCupTeams(cup)).some(t=>t.id===m.teamId))return "Team is no longer eligible or has withdrawn.";
    const recipient=await prisma.notificationRecipient.findUnique({where:{id:input.recipientId},include:{preferences:true}});
    if(!recipient || recipient.email?.trim().toLowerCase()!==m.recipientEmail || recipient.isSuppressed || !recipient.transactionalEmailOptIn || recipient.preferences?.emailEnabled===false)return "Cup contact changed or email delivery is disabled.";
    if(!(await getTeamOperationalEmailContacts(m.teamId)).some(c=>c.email===m.recipientEmail))return "Recipient is no longer a current team contact.";
    return null;
  } catch(error) {
    if(error instanceof CupInvitationError)return error.message;
    // Fail closed if the authoritative state cannot be checked.
    throw error;
  }
}
