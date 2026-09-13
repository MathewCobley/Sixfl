"use server";
import { revalidatePath } from "next/cache";
import { requireCaptain } from "@/lib/requireCaptain";
import { cupErrorMessage,respondToCup } from "@/lib/cups/invitations";
import type { CupActionState } from "@/components/cups/types";
export async function captainCupResponse(_:CupActionState,form:FormData):Promise<CupActionState> {
  const teamId=String(form.get("teamId")||""),access=await requireCaptain(teamId);
  try{const result=await respondToCup({access:{teamId,cupId:String(form.get("cupId")||""),actorId:access.user?.id||""},response:String(form.get("response")||""),expectedVersion:Number(form.get("version")),confirmed:form.get("confirmed")==="on"});revalidatePath(`/captain/team/${teamId}/cup-invitations`);return {success:result.response==="YES"?"Your team's interest is recorded. Final arrangements and entry will be agreed with SIXFL.":"Your team is recorded as not interested this time."};}catch(e){return {error:cupErrorMessage(e)};}
}
