import Link from "next/link";
import { requireAdmin } from "@/lib/requireAdmin";
import { loadCup } from "@/lib/cups/invitation-data";
import { toLondonDateInputValue, toLondonTimeInputValue } from "@/lib/datetime/london";
import CupSetupForm from "@/components/cups/CupSetupForm";
import { saveCupSettingsAction } from "./invitation-actions";
export default async function CupSetupPage({params}:{params:Promise<{id:string}>}) {
  await requireAdmin();const {id}=await params,cup=await loadCup(id),s=cup.settings;
  return <div className="space-y-5"><div className="flex flex-wrap gap-3">
    <Link href={`/admin/leagues/${id}`} className="rounded-xl border border-white/15 px-4 py-3 text-sm">Competition name, season & format</Link>
    <Link href={`/admin/cups/${id}/entrants`} className="rounded-xl border border-white/15 px-4 py-3 text-sm">Manage cup entrants</Link>
  </div><CupSetupForm cupId={id} action={saveCupSettingsAction} values={{version:s?.revision||0,fee:String((s?.matchFeePence??4000)/100),
    venueNote:s?.venueNote||"Rawdon and Catterick — proposed locations, subject to confirmation.",
    scheduleNote:s?.scheduleNote||"Cup matches may take place on a different night from your usual league fixtures. Dates, venues and kick-off times are still to be confirmed.",
    deadlineDate:toLondonDateInputValue(s?.responseDeadline??null),deadlineTime:toLondonTimeInputValue(s?.responseDeadline??null),state:s?.state||"DRAFT"}}/>
    <p className="text-sm text-white/55">Saving setup never sends an invitation. The invitation and reminder wording is editable in System Templates.</p></div>;
}
