"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/requireAdmin";
import { changeCupEntry, cupErrorMessage, previewCupInvitations, saveCupInvitationSettings, sendCupInvitations } from "@/lib/cups/invitations";
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
  const actorId=await actor();try{const teamIds=selected(form),kind=text(form,"kind") as CupMailKind;return {preview:await previewCupInvitations({cupId:text(form,"cupId"),actorId,teamIds,kind}),teamIds,kind};}catch(e){return {error:cupErrorMessage(e)};}
}
export async function sendCupMailAction(_:CupActionState,form:FormData):Promise<CupActionState>{
  const actorId=await actor(),cupId=text(form,"cupId");try{const results=await sendCupInvitations({cupId,actorId,teamIds:selected(form),kind:text(form,"kind") as CupMailKind,previewKey:text(form,"previewKey"),confirmed:form.get("confirmed")==="on"});refresh(cupId);return {results,success:"Email requests processed. Queued is not confirmation of delivery. Each team's status is shown below."};}catch(e){return {error:cupErrorMessage(e)};}
}
export async function changeCupEntryAction(_:CupActionState,form:FormData):Promise<CupActionState>{
  const actorId=await actor(),cupId=text(form,"cupId");try{await changeCupEntry({cupId,teamId:text(form,"teamId"),actorId,remove:text(form,"operation")==="remove",confirmed:form.get("confirmed")==="on"});refresh(cupId);return {success:"Cup entry updated. The normal league, fixtures and payments have not changed. No email was sent."};}catch(e){return {error:cupErrorMessage(e)};}
}
