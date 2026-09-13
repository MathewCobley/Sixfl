"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export default function CupTabs({cupId}:{cupId:string}) {
  const pathname=usePathname(),base=`/admin/cups/${cupId}`;
  return <nav aria-label="Cup administration" className="flex flex-wrap gap-2 border-b border-white/10 pb-4">{[["","Cup setup"],["/invitations","Invitations & responses"],["/entrants","Cup entrants"]].map(([suffix,label])=>{
    const active=suffix?pathname.startsWith(base+suffix):pathname===base;
    return <Link key={suffix} href={base+suffix} aria-current={active?"page":undefined} className={`rounded-xl border px-4 py-3 text-sm font-semibold ${active?"border-emerald-400/40 bg-emerald-500/15 text-emerald-100":"border-white/10 text-white/70 hover:bg-white/5"}`}>{label}</Link>;
  })}</nav>;
}
