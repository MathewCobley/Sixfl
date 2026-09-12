import Link from 'next/link';
import { StopFutureVeo } from './VeoFixtureConfirmation';
export default function CaptainVeoConfirmationInfo({teamId,leagueId,ongoing,preview}:{teamId:string;leagueId:string;ongoing:boolean;preview:boolean}) {
  return <section aria-label="Veo Priority" className="space-y-4 rounded-3xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-5 text-white sm:p-6">
    <p className="text-xs font-semibold uppercase tracking-wider text-fuchsia-200">📹 SIXFL TV · Veo Priority</p>
    <h2 className="text-xl font-bold">{ongoing?'Veo Priority is your saved preference':'Get your match on SIXFL TV'}</h2>
    <p className="max-w-3xl text-sm leading-6 text-white/80">Watch your goals back and share the game with your squad. Open <strong>Fixtures</strong> and choose Veo when you confirm your team can play: <strong>just this match</strong>, or <strong>this and future matches</strong>.</p>
    <p className="max-w-3xl text-sm leading-6 text-white/80"><strong>£5 extra for the whole team</strong> only when SIXFL confirms your request on the camera pitch. Limited spaces; no place means no extra charge. Recordings may be published publicly on SIXFL TV/YouTube. Failed recordings are cancelled or credited.</p>
    {ongoing&&<p className="text-sm leading-6 text-fuchsia-100">You can skip a match when confirming it, or turn off future Priority below. Accepted bookings are unchanged.</p>}
    <Link href={`/captain/team/${teamId}/fixtures`} className="inline-flex min-h-11 items-center rounded-xl border border-fuchsia-300/40 px-4 py-2 font-semibold hover:bg-white/10">Choose Veo / confirm fixture</Link>
    {ongoing&&<StopFutureVeo teamId={teamId} leagueId={leagueId} preview={preview}/>}
  </section>;
}
