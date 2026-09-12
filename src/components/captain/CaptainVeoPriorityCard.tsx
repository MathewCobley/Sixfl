import Link from 'next/link';
import { requireCaptain } from '@/lib/requireCaptain';
import { readVeoOffer, VEO_REQUEST_TERMS } from '@/lib/veo/priority-requests';
import VeoPriorityRequestForm from './VeoPriorityRequestForm';

export default async function CaptainVeoPriorityCard({ teamId, leagueId }: { teamId: string; leagueId: string | null }) {
  const access = await requireCaptain(teamId);
  const offer = await readVeoOffer(leagueId, teamId);
  if (!offer || !leagueId) return null;
  const canRequest = access.accessMode === 'CAPTAIN' && !access.isAdmin && Boolean(access.user?.id);
  const pending = offer.request?.status === 'PENDING';
  const declined = offer.request?.status === 'DECLINED';
  return <section aria-label="Veo Priority" className="space-y-4 rounded-3xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-fuchsia-200">📹 SIXFL TV · Veo Priority</p>
        <h2 className="mt-2 text-xl font-bold text-white sm:text-2xl">{offer.priority ? 'Veo Priority is ON for your team' : pending ? 'Veo Priority requested' : 'Get more of your matches on SIXFL TV'}</h2>
      </div>
      <span className="rounded-full border border-fuchsia-300/30 px-3 py-1 text-sm font-semibold text-fuchsia-100">{offer.priority ? 'Priority ON' : pending ? 'Awaiting approval' : '£5 when allocated'}</span>
    </div>
    <p className="max-w-3xl text-sm leading-6 text-white/80">Give your team priority for fixtures on our camera-equipped pitch. It is £5 extra per team when allocated to a Veo match, not £5 per player. No Veo allocation means no supplement. Filming is subject to availability, and footage may be published publicly on SIXFL TV/YouTube.</p>
    {offer.priority ? <div className="space-y-2"><p className="text-sm leading-6 text-emerald-100">Your choice applies to future fixture publications. Check Fixtures to see your filming allocations and agreed match fees.</p><Link href={`/captain/team/${teamId}/fixtures`} className="inline-flex min-h-11 items-center rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">View your fixtures</Link></div>
      : pending ? <p role="status" className="rounded-xl border border-amber-300/30 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">Your request is awaiting SIXFL approval. You do not need to submit it again. Your fees have not changed.</p>
      : declined ? <p className="text-sm leading-6 text-white/80">Your request was not approved. <Link href={`/captain/team/${teamId}/messages`} className="font-semibold text-fuchsia-100 underline">Contact SIXFL</Link> to discuss Veo Priority.</p>
      : canRequest ? <VeoPriorityRequestForm teamId={teamId} leagueId={leagueId} termsVersion={VEO_REQUEST_TERMS} />
      : <p className="text-sm leading-6 text-white/65">This is a read-only preview. The captain can request Priority here when signed in to their own account.</p>}
  </section>;
}
