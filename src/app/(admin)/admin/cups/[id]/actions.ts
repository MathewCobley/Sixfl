"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/requireAdmin";
import { changeCupEntry } from "@/lib/cups/invitations";
async function change(form:FormData,remove:boolean) {
  const access=await requireAdmin(),cupId=String(form.get("leagueId")||form.get("cupId")||"");
  await changeCupEntry({cupId,teamId:String(form.get("teamId")||""),actorId:access.user?.id||"",remove,confirmed:form.get("confirmed")==="on"});
  revalidatePath('/admin/cups');revalidatePath(`/admin/cups/${cupId}/entrants`);
}
export async function addCupEntrantAction(form:FormData){await change(form,false);}
export async function removeCupEntrantAction(form:FormData){await change(form,true);}
