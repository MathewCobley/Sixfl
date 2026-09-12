import { prisma } from '@/lib/prisma';
import { queueNotificationFromTemplate } from '@/lib/notifications/service';
import { upsertTeamOperationalEmailRecipients } from '@/lib/notifications/team-operational-recipients';
import { getPublicSiteUrl } from '@/lib/stripe/client';

const templates:Record<string,string>={ACCEPTED:'veo-match-accepted',FREE:'veo-match-free',NO_SLOT:'veo-match-no-slot',FAILED:'veo-match-failed',PITCH_CHANGED:'veo-pitch-update'};
/** Durable, retryable outbox. This only uses the normal template queue; it never
 * contacts providers, resets fixture confirmation or creates/repeats a charge. */
export async function queueVeoNightNotices(nightId:string,actorId:string) {
  const notices=await prisma.$queryRaw<{id:string;fixtureId:string;teamId:string;kind:string;teamName:string;homeName:string;awayName:string;kickoffAt:Date;pitch:string|null;failedAt:Date|null}[]>`
    SELECT n.*,t.name AS "teamName",h.name AS "homeName",a.name AS "awayName",d."kickoffAt",d.pitch,d."failedAt"
    FROM "VeoMatchNotice" n JOIN "VeoMatchDecision" d ON d."fixtureId"=n."fixtureId"
    JOIN "Team" t ON t.id=n."teamId" JOIN "Team" h ON h.id=d."homeTeamId" JOIN "Team" a ON a.id=d."awayTeamId"
    WHERE d."nightId"=${nightId} AND n."queuedAt" IS NULL ORDER BY n.id`;
  let pending=0;
  for(const n of notices) {
    try {
      const recipients=await upsertTeamOperationalEmailRecipients(n.teamId);
      if(!recipients.length) throw new Error('No saved email recipient for this team.');
      await prisma.$transaction(async tx=>{
        const [current]=await tx.$queryRaw<{queuedAt:Date|null}[]>`SELECT "queuedAt" FROM "VeoMatchNotice" WHERE id=${n.id} FOR UPDATE`;
        if(current?.queuedAt)return;
        if(n.failedAt&&n.kind!=='FAILED') {await tx.$executeRaw`UPDATE "VeoMatchNotice" SET "queuedAt"=NOW(),"lastError"='Superseded by recording cancellation' WHERE id=${n.id}`;return;}
        const base=getPublicSiteUrl();
        for(const r of recipients) await queueNotificationFromTemplate({templateKey:templates[n.kind],recipientId:r.id,
          sourceType:'FIXTURE_VEO_BOOKING',sourceId:n.fixtureId,createdByUserId:actorId,
          variables:{team_name:n.teamName,fixture_label:`${n.homeName} vs ${n.awayName}`,kickoff:new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',dateStyle:'medium',timeStyle:'short'}).format(n.kickoffAt),pitch:n.pitch??'your scheduled pitch',captainFixturesUrl:`${base}/captain/team/${n.teamId}/fixtures?fixtureId=${n.fixtureId}`,captainPaymentsUrl:`${base}/captain/team/${n.teamId}/payments`},
          metadata:{fixtureId:n.fixtureId,teamId:n.teamId,veoNoticeId:n.id,veoNoticeKind:n.kind}},tx);
        await tx.$executeRaw`UPDATE "VeoMatchNotice" SET "queuedAt"=NOW(),"lastError"=NULL WHERE id=${n.id}`;
      });
    }catch(e){pending++;console.error('Veo booking notice remains pending',{id:n.id,error:e});await prisma.$executeRaw`UPDATE "VeoMatchNotice" SET "lastError"='Could not queue update. Check the recipient and template, then retry.' WHERE id=${n.id}`;}
  }
  return {pending};
}
