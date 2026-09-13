import { requireCaptain } from "@/lib/requireCaptain";
import { prisma } from "@/lib/prisma";
import { getCupResponseContext,cupErrorMessage } from "@/lib/cups/invitations";
import { cupDate,money,responseLabel } from "@/lib/cups/invitation-policy";
import CupResponseForm from "@/components/cups/CupResponseForm";
import { captainCupResponse } from "./actions";
export const dynamic="force-dynamic";
export default async function CaptainCupInvitations({params}:{params:Promise<{teamid:string}>}) {
  const {teamid}=await params,access=await requireCaptain(teamid);
  if(!access.user||(!access.isCaptain&&!access.isAdmin))return <p>Captain access is required.</p>;
  const invites=await prisma.$queryRaw<Array<{cupLeagueId:string}>>`SELECT "cupLeagueId" FROM "CupInvitation" WHERE "teamId"=${teamid} ORDER BY "createdAt" DESC`;
  return <section className="space-y-5"><h1 className="text-2xl font-semibold">Cup invitations</h1>{!invites.length?<p className="text-white/60">Your team has no cup invitations yet.</p>:null}
    {await Promise.all(invites.map(async i=>{try{const c=await getCupResponseContext({cupId:i.cupLeagueId,teamId:teamid,actorId:access.user!.id}),t=c.invitation.terms;return <article key={i.cupLeagueId} className="space-y-4 rounded-2xl border border-white/15 bg-white/[0.04] p-5"><h2 className="text-xl font-semibold">{t.cupName}</h2><p className="text-sm">{t.cupFormat} · {money(t.matchFeePence)} per team per match</p><p className="text-sm text-white/65">{t.venueNote}</p><p className="text-sm text-white/65">{t.scheduleNote}</p><p className="text-sm">Reply by {cupDate(t.responseDeadline)}</p><p className="text-sm">Current response: <strong>{responseLabel(c.invitation.response)}</strong></p>{c.canRespond?<CupResponseForm action={captainCupResponse} fields={{teamId:teamid,cupId:i.cupLeagueId}} response={c.invitation.response} version={c.invitation.responseVersion}/>:<p className="text-sm text-amber-200">{c.blocked}</p>}</article>;}catch(e){return <p key={i.cupLeagueId} className="text-sm text-white/60">{cupErrorMessage(e)}</p>;}}))}
  </section>;
}
