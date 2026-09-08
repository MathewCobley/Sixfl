import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { getPublicSiteUrl } from "@/lib/stripe/client";
import { getPlayerRepaymentTarget } from "./player-repayment-checkout";
import { money } from "./player-ledger";

export const PLAYER_REPAYMENT_SOURCE = "PLAYER_REPAYMENT_PLAN";
const TEMPLATE="player-repayment-instalment-email";
const date=(d:Date)=>formatDateTimeInLondon(d,{weekday:"long",day:"numeric",month:"long",year:"numeric"});

/** Only explicitly created arrangements. One email per due date, not per old
 * match; no extra SMS or automatic saved-card collection. */
export async function runPlayerRepaymentReminderJob(){
  const plans=await prisma.playerRepaymentPlan.findMany({where:{status:"ACTIVE",nextDueAt:{lte:new Date()}},orderBy:{nextDueAt:"asc"},take:200});
  const summary={scanned:plans.length,queued:0,held:0,errors:[] as string[]};
  for(const plan of plans){
    try{
      const result=await prisma.$transaction(async db=>{
        await db.$queryRaw(Prisma.sql`SELECT id FROM "PlayerRepaymentPlan" WHERE id=${plan.id} FOR UPDATE`);
        const t=await getPlayerRepaymentTarget({planToken:plan.token},db);
        if(t.hold||!t.plan||!t.account.email)return null;
        const due=t.plan.nextDueAt.toISOString();
        const existing=await db.notificationDispatch.findFirst({where:{sourceType:PLAYER_REPAYMENT_SOURCE,sourceId:plan.id,metadata:{path:["instalmentDueAt"],equals:due}},select:{id:true}});
        if(existing)return null;
        const sourceId=`player-match-fee:${plan.anchorFeeId}`;
        const contact={displayName:t.account.playerName,email:t.account.email,emailNormalized:t.account.email,lastSyncedAt:new Date()};
        const recipient=await db.notificationRecipient.upsert({where:{sourceType_sourceId:{sourceType:"GENERAL",sourceId}},update:contact,
          create:{...contact,sourceType:"GENERAL",sourceId,audience:"PLAYER",transactionalEmailOptIn:true,marketingEmailOptIn:false,marketingSmsOptIn:false,metadata:{teamId:plan.teamId,playerMatchFeeId:plan.anchorFeeId}}});
        await db.notificationPreference.upsert({where:{recipientId:recipient.id},update:{},create:{recipientId:recipient.id}});
        const dispatch=await queueNotificationFromTemplate({templateKey:TEMPLATE,recipientId:recipient.id,sourceType:PLAYER_REPAYMENT_SOURCE,sourceId:plan.id,
          variables:{firstName:t.account.playerName.split(/\s+/)[0],teamName:t.account.teamName,amount:money(t.amountPence),balance:money(t.balancePence),remainingBalance:money(Math.max(t.balancePence-t.amountPence,0)),dueDate:date(t.plan.nextDueAt),paymentUrl:`${getPublicSiteUrl()}${t.path}`},
          metadata:{origin:"player_repayment_arrangement",originLabel:"Agreed player repayment",teamId:plan.teamId,playerMatchFeeId:plan.anchorFeeId,contactName:t.account.playerName,instalmentDueAt:due,amountPence:t.amountPence,balancePence:t.balancePence,toEmail:t.account.email},
          emailBranding:{teamName:t.account.teamName,teamLogoUrl:t.account.fees[0]?.team.logoUrl??null},
        },db);
        return {dispatch,recipient};
      },{maxWait:5000,timeout:15000});
      if(result){
        if(result.dispatch.status==="QUEUED")summary.queued++;else summary.held++;
        try{await logNotificationDispatchToThread(result);}catch(error){console.error("Repayment reminder queued; timeline logging requires review",result.dispatch.id,error);}
      }else summary.held++;
    }catch(error){summary.errors.push(`${plan.id}: ${error instanceof Error?error.message:"Reminder failed"}`);}
  }
  if(summary.errors.length)throw new Error(`Player repayment reminders: ${summary.queued} queued; ${summary.errors.slice(0,10).join("; ")}`);
  return summary;
}

export async function playerRepaymentReminderDeliveryBlock(dispatch:{sourceType:string|null;sourceId:string|null;metadata:unknown;recipientId:string;recipient:{email:string|null}}){
  if(dispatch.sourceType!==PLAYER_REPAYMENT_SOURCE)return null;
  if(!dispatch.sourceId)return "Repayment reminder has no arrangement reference.";
  const plan=await prisma.playerRepaymentPlan.findUnique({where:{id:dispatch.sourceId}});
  if(!plan)return "Repayment arrangement no longer exists.";
  const t=await getPlayerRepaymentTarget({planToken:plan.token});
  if(t.hold)return t.hold;
  const meta=(dispatch.metadata??{}) as Record<string,unknown>;
  if(plan.nextDueAt.toISOString()!==meta.instalmentDueAt||t.amountPence!==meta.amountPence||t.balancePence!==meta.balancePence||t.account.email!==meta.toEmail||t.account.email!==dispatch.recipient.email?.trim().toLowerCase())return "Repayment details or balance changed; outdated reminder cancelled.";
  const r=await prisma.notificationRecipient.findUnique({where:{id:dispatch.recipientId},include:{preferences:true}});
  if(!r||r.isSuppressed||!r.transactionalEmailOptIn||r.preferences?.emailEnabled===false||r.email?.trim().toLowerCase()!==t.account.email)return "Repayment reminder disabled by current contact details/preferences.";
  return null;
}
