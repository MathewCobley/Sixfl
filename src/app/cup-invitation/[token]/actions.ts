"use server";
import { revalidatePath } from "next/cache";
import { cupErrorMessage,respondToCup } from "@/lib/cups/invitations";
import type { CupActionState } from "@/components/cups/types";
export async function submitCupResponse(_:CupActionState,form:FormData):Promise<CupActionState>{
  const token=String(form.get("token")||"");
  try{const result=await respondToCup({access:{token},response:String(form.get("response")||""),expectedVersion:Number(form.get("version")),confirmed:form.get("confirmed")==="on"});revalidatePath(`/cup-invitation/${token}`);return {success:result.response==="YES"?"Thanks — your team's interest is recorded. SIXFL will confirm the final arrangements before entry.":"Thanks — your team is recorded as not interested this time."};}catch(e){return {error:cupErrorMessage(e)};}
}
