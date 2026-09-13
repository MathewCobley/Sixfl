import Link from "next/link";
import { requireAdmin } from "@/lib/requireAdmin";
import { loadCup } from "@/lib/cups/invitation-data";
import CupTabs from "@/components/cups/CupTabs";
export const dynamic="force-dynamic";
export default async function CupLayout({children,params}:{children:React.ReactNode;params:Promise<{id:string}>}) {
  await requireAdmin();const {id}=await params,cup=await loadCup(id);
  return <div className="w-full min-w-0 space-y-6"><header className="space-y-3">
    <Link href="/admin/cups" className="text-sm text-emerald-300">← All cups</Link>
    <h1 className="break-words text-3xl font-semibold text-white">{cup.name}</h1>
    <p className="text-sm text-white/60">{cup.season} · {cup.cupFormat==="GROUPS_THEN_KNOCKOUT"?"Groups + knockout":"Straight knockout"}{cup.isInterLeague?" · Inter-league":""}</p>
    <CupTabs cupId={id}/></header>{children}</div>;
}
