import Link from 'next/link';
import { requireCaptain } from '@/lib/requireCaptain';
import { readVeoOffer } from '@/lib/veo/priority-requests';
import { StopFutureVeoForm } from './FixtureVeoConfirmationForm';
export default async function CaptainVeoPriorityCard({teamId,leagueId}:{teamId:string;leagueId:string|null}) {
  const access=await requireCaptain(teamId);
  const offer=await readVeoOffer(leagueId,teamId);
  if(!offer||!leagueId)return null;
  const preview=access.accessMode!=='captain'||access.isAdmin||!access.isCaptain||!access.user?.id;
  return <div className="space-y-3">
    {preview&&<aside aria-label="Veo preview notice" className="rounded-xl border border-amber-300/20 p-3 text-sm text-amber-100">Preview only — showing the captain’s options. No preferences can be changed here.</aside>}
    <section aria-label="Veo Priority" className="space-y-4 rounded-3xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-widest text-fuchsia-200">📹 SIXFL TV · Veo Priority</p>
      <h2 className="text-xl font-bold text-white">{offer.priority?'Veo Priority is your saved preference':'Would you like your match filmed?'}</h2>
      <p className="max-w-3xl text-sm leading-6 text-white/80">Open your fixture and choose <strong>Just this match</strong> or <strong>This and future matches</strong> when you confirm your team can play. It is <strong>£5 extra for the whole team</strong> if your request is accepted and a usable recording is available. No filming space or no usable recording means no extra charge.</p>
      <p className="text-xs leading-5 text-white/65">Veo is optional and filming spaces are limited. Match footage may be published publicly on SIXFL TV/YouTube.</p>
      {offer.priority&&<p className="text-sm text-fuchsia-100">Your preference is selected automatically next time you confirm. You can skip one match without switching it off.</p>}
      {offer.request?.status==='PENDING'&&<p className="text-sm text-amber-100">Your earlier ongoing-Priority request is still awaiting SIXFL review. You can request a specific fixture in the meantime.</p>}
      <Link href={`/captain/team/${teamId}/fixtures`} className="inline-flex min-h-11 items-center rounded-xl border border-fuchsia-300/30 px-4 py-3 text-sm font-semibold text-white hover:bg-fuchsia-400/10">Open fixtures and choose Veo</Link>
      {offer.priority&&<StopFutureVeoForm teamId={teamId} leagueId={leagueId} preview={preview}/>}
    </section>
  </div>;
}
