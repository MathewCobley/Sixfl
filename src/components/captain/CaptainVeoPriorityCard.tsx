import Link from 'next/link';
import { requireCaptain } from '@/lib/requireCaptain';
import { readVeoOffer, VEO_REQUEST_TERMS } from '@/lib/veo/priority-requests';
import VeoPriorityRequestForm from './VeoPriorityRequestForm';

export default async function CaptainVeoPriorityCard({ teamId, leagueId }: { teamId: string; leagueId: string | null }) {
  const access = await requireCaptain(teamId);
  const offer = await readVeoOffer(leagueId, teamId);
  if (!offer || !leagueId) return null;

  const canRequest = access.accessMode === 'captain' && !access.isAdmin && access.isCaptain && Boolean(access.user?.id);
  const pending = offer.request?.status === 'PENDING';
  const declined = offer.request?.status === 'DECLINED';

  return (
    <div className="space-y-3">
      {!canRequest && (
        <aside aria-label="Veo preview notice" className="rounded-xl border border-amber-300/20 bg-amber-400/5 px-4 py-3 text-sm leading-6 text-amber-100/80">
          Preview only — the captain sees the offer below. Request controls are visible but disabled in this view; no request will be sent.
        </aside>
      )}
      <section aria-label="Veo Priority" className="space-y-5 rounded-3xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-fuchsia-200">📹 SIXFL TV · Veo Priority</p>
            <h2 className="mt-2 text-xl font-bold text-white sm:text-2xl">
              {offer.priority ? 'Veo Priority is ON for your team' : pending ? 'Veo Priority requested' : declined ? 'Veo Priority request not approved' : 'Get more of your matches on SIXFL TV'}
            </h2>
          </div>
          <span className="rounded-full border border-fuchsia-300/30 px-3 py-1 text-sm font-semibold text-fuchsia-100">
            {offer.priority ? 'Priority ON' : pending ? 'Awaiting approval' : declined ? 'Not approved' : '£5 extra per team'}
          </span>
        </div>

        <div className="max-w-3xl space-y-3 text-sm leading-6 text-white/80">
          <p>Watch your goals back and share the game with your squad. Veo Priority gives your team first priority for matches on our camera-equipped pitch.</p>
          <p><strong className="text-white">Just £5 extra for the whole team</strong> when your match is scheduled on the Veo pitch. Otherwise, you pay your usual match fee.</p>
          <p className="text-white/65">Recordings may be published publicly on SIXFL TV/YouTube. Filming depends on pitch and camera availability and is not guaranteed for every match.</p>
        </div>

        {offer.priority ? (
          <div className="space-y-3">
            <p className="max-w-3xl text-sm leading-6 text-emerald-100">We will prioritise your team for the Veo pitch when scheduling new matches. Open Fixtures to see which matches are on Veo and what your team will pay. Matches already published are unchanged.</p>
            <Link href={`/captain/team/${teamId}/fixtures`} className="inline-flex min-h-11 items-center rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">View your fixtures</Link>
          </div>
        ) : pending ? (
          <p role="status" className="rounded-xl border border-amber-300/30 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">Your request is awaiting SIXFL approval. We will show Priority ON here if it is approved. You do not need to request it again, and your fees have not changed.</p>
        ) : declined ? (
          <p className="text-sm leading-6 text-white/80">Your request was not approved. <Link href={`/captain/team/${teamId}/messages`} className="font-semibold text-fuchsia-100 underline">Contact SIXFL</Link> to discuss Veo Priority.</p>
        ) : (
          <div className="space-y-4 rounded-2xl border border-fuchsia-300/20 bg-black/15 p-4 sm:p-5">
            <div className="max-w-3xl space-y-2">
              <h3 className="text-base font-semibold text-white">How to switch it on</h3>
              <p className="text-sm leading-6 text-white/80">Tick the agreement below and press <strong className="text-white">Request Veo Priority</strong>. SIXFL will review your request and, if approved, switch it on for your team. Until then, your fees stay the same.</p>
            </div>
            <VeoPriorityRequestForm teamId={teamId} leagueId={leagueId} termsVersion={VEO_REQUEST_TERMS} preview={!canRequest} />
          </div>
        )}
      </section>
    </div>
  );
}
