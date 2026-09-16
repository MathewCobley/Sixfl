"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/requireAdmin";
import { prisma } from "@/lib/prisma";
import { assertCupAdmin, cupTerms, isCupEntrant, loadCup, loadInvitation } from "@/lib/cups/invitation-data";
import { changeCupEntry, cupAudit, cupErrorMessage, previewCupInvitations, saveCupInvitationSettings, sendCupInvitations, termsEqual } from "@/lib/cups/invitations";
import { CupInvitationError, type CupMailKind } from "@/lib/cups/invitation-policy";
import type { CupActionState } from "@/components/cups/types";
const text=(form:FormData,key:string)=>String(form.get(key) ?? "").trim();
async function actor(){const access=await requireAdmin();return access.user?.id || "";}
function refresh(id:string){for(const tail of ["","/invitations","/entrants","/entrants/draw"])revalidatePath(`/admin/cups/${id}${tail}`);revalidatePath('/admin/cups');}
function selected(form:FormData){
  let ids:unknown;try{ids=JSON.parse(text(form,"teamIds"));}catch{throw new CupInvitationError("Choose the teams to invite.");}
  if(!Array.isArray(ids)||!ids.every(i=>typeof i==="string" && i.length<150)||ids.length>100)throw new CupInvitationError("Choose up to 100 teams.");return ids as string[];
}
export async function saveCupSettingsAction(_:CupActionState,form:FormData):Promise<CupActionState>{
  const actorId=await actor(),cupId=text(form,"cupId");
  try {const saved=await saveCupInvitationSettings({actorId,cupId,expectedVersion:Number(text(form,"version")),fee:text(form,"fee"),venueNote:text(form,"venueNote"),scheduleNote:text(form,"scheduleNote"),deadlineDate:text(form,"deadlineDate"),deadlineTime:text(form,"deadlineTime"),state:text(form,"state")});refresh(cupId);return {success:saved.detailsChanged?"Cup invitation details saved. No emails sent. Previous invitations need a revised invitation before their responses count against changed details.":"Cup invitation status saved. Existing responses are preserved. No emails sent."};}catch(e){return {error:cupErrorMessage(e)};}
}
export async function previewCupMailAction(_:CupActionState,form:FormData):Promise<CupActionState>{
  const actorId=await actor();try{const teamIds=selected(form),kind=text(form,"kind") as CupMailKind,templateId=text(form,"templateId");return {preview:await previewCupInvitations({cupId:text(form,"cupId"),actorId,teamIds,kind,templateId:templateId||undefined}),teamIds,kind,templateId:templateId||undefined};}catch(e){return {error:cupErrorMessage(e)};}
}
export async function sendCupMailAction(_:CupActionState,form:FormData):Promise<CupActionState>{
  const actorId=await actor(),cupId=text(form,"cupId");try{const templateId=text(form,"templateId");const results=await sendCupInvitations({cupId,actorId,teamIds:selected(form),kind:text(form,"kind") as CupMailKind,templateId:templateId||undefined,previewKey:text(form,"previewKey"),confirmed:form.get("confirmed")==="on"});refresh(cupId);return {results,success:"Email requests processed. Queued is not confirmation of delivery. Each team's status is shown below."};}catch(e){return {error:cupErrorMessage(e)};}
}
export async function updateCupResponseAction(_:CupActionState,form:FormData):Promise<CupActionState>{
  const actorId=await actor(),cupId=text(form,"cupId"),teamId=text(form,"teamId"),response=text(form,"response");
  try {
    if(!["PENDING","YES","NO"].includes(response))throw new CupInvitationError("Choose Awaiting response, Yes — interested, or No — not this time.");
    await prisma.$transaction(async db=>{
      const admin=await assertCupAdmin(actorId,db),cup=await loadCup(cupId,db,true),invitation=await loadInvitation(cupId,teamId,db);
      if(!invitation)throw new CupInvitationError("This team has not been invited to this cup.");
      if(await isCupEntrant(cupId,teamId,db))throw new CupInvitationError("This response is locked because the team is already a confirmed entrant. Change the entry first if needed.");
      const withdrawn=await db.$queryRaw<Array<{id:string}>>`SELECT id FROM "LeagueSeasonTeam" WHERE "leagueId"=${cupId} AND "teamId"=${teamId} AND "isActive"=false LIMIT 1`;
      if(withdrawn.length)throw new CupInvitationError("This response is locked because the team has been withdrawn from the cup.");
      if(!cup.settings || invitation.settingsVersion!==cup.settings.version || !termsEqual(invitation.terms,cupTerms(cup)))throw new CupInvitationError("This invitation is out of date. Send the team a revised invitation instead of editing the old response.");
      if(invitation.response===response)return;
      const previous=invitation.response,adminName=admin.name?`${admin.name} (admin)`:"SIXFL admin";
      if(response==="PENDING") {
        await db.$executeRaw`UPDATE "CupInvitation" SET response='PENDING',"responseVersion"="responseVersion"+1,"respondedAt"=NULL,"respondedByName"=NULL,"respondedByUserId"=NULL,"lastReminderAt"=NULL,"updatedAt"=NOW() WHERE id=${invitation.id}`;
      } else {
        await db.$executeRaw`UPDATE "CupInvitation" SET response=${response},"responseVersion"="responseVersion"+1,"respondedAt"=NOW(),"respondedByName"=${adminName},"respondedByUserId"=${admin.id},"updatedAt"=NOW() WHERE id=${invitation.id}`;
        await db.$executeRaw`UPDATE "NotificationDispatch" d SET status='CANCELLED',"cancelledAt"=NOW(),"failureReason"='Cup response updated by SIXFL administrator.',"updatedAt"=NOW()
          FROM "CupInvitationMessage" m WHERE d.id=m."dispatchId" AND m."invitationId"=${invitation.id} AND d.status='QUEUED'`;
      }
      await cupAudit(db,cupId,teamId,admin.id,adminName,"RESPONSE_ADMIN_EDITED",{previous,response,version:invitation.settingsVersion});
    },{timeout:15000});
    refresh(cupId);
    return {success:"Response updated. No email was sent and the existing email/contact history has been kept."};
  }catch(e){return {error:cupErrorMessage(e)};}
}
export async function changeCupEntryAction(_:CupActionState,form:FormData):Promise<CupActionState>{
  const actorId=await actor(),cupId=text(form,"cupId");try{await changeCupEntry({cupId,teamId:text(form,"teamId"),actorId,remove:text(form,"operation")==="remove",confirmed:form.get("confirmed")==="on"});refresh(cupId);return {success:"Cup entry updated. The normal league, fixtures and payments have not changed. No email was sent."};}catch(e){return {error:cupErrorMessage(e)};}
}
