import { cupErrorMessage,getCupResponseContext } from "@/lib/cups/invitations";
import { cupDate,money,responseLabel } from "@/lib/cups/invitation-policy";
import CupResponseForm from "@/components/cups/CupResponseForm";
import { submitCupResponse } from "./actions";
export const dynamic="force-dynamic";
export const metadata={title:"Cup invitation | SIXFL",robots:{index:false,follow:false},referrer:"no-referrer" as const};
export default async function CupResponsePage({params,searchParams}:{params:Promise<{token:string}>;searchParams:Promise<{answer?:string}>}) {
  const {token}=await params,{answer}=await searchParams;
  try {
    const c=await getCupResponseContext({token}),terms=c.invitation.terms;
    return <main className="mx-auto max-w-3xl space-y-5 px-4 py-10 text-white"><p className="text-sm font-semibold text-emerald-300">SIXFL CUP INVITATION</p><h1 className="text-3xl font-semibold">{terms.cupName}</h1><h2 className="text-xl">{c.team.teamName}</h2>
      <section className="space-y-3 rounded-2xl border border-white/15 bg-white/[0.04] p-5 text-sm leading-6"><p><strong>Format:</strong> {terms.cupFormat}</p><p><strong>Cost:</strong> {money(terms.matchFeePence)} per team per match.</p><p><strong>Locations:</strong> {terms.venueNote}</p><p><strong>Match nights and dates:</strong> {terms.scheduleNote}</p><p><strong>Respond by:</strong> {cupDate(terms.responseDeadline)} (UK time).</p></section>
      <p className="text-sm text-white/70">Current response: <strong>{responseLabel(c.invitation.response)}</strong>{c.invitation.respondedByName?` · ${c.invitation.respondedByName} · ${cupDate(c.invitation.respondedAt)}`:""}. Opening this page does not change it.</p>
      {c.canRespond?<CupResponseForm action={submitCupResponse} fields={{token}} response={c.invitation.response} initialAnswer={answer==="YES"||answer==="NO"?answer:undefined} version={c.invitation.responseVersion}/>:<p className="rounded-xl border border-amber-400/25 p-4 text-sm text-amber-100">{c.blocked}</p>}
    </main>;
  } catch(e){return <main className="mx-auto max-w-xl space-y-4 px-5 py-16"><h1 className="text-2xl font-semibold">Cup invitation</h1><p>{cupErrorMessage(e)}</p><a href="mailto:hello@sixfl.co.uk" className="text-emerald-300 underline">Contact SIXFL</a></main>;}
}
