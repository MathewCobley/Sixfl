import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireAdmin } from '@/lib/requireAdmin';
import { pendingVeoRequests } from '@/lib/veo/priority-requests';
import ReviewRequestForm from './ReviewRequestForm';

export default async function VeoPriorityLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const requests = await pendingVeoRequests(id);
  return <div className="space-y-6">
    <section aria-label="Veo Priority requests" className="mx-auto max-w-7xl space-y-4 rounded-2xl border border-fuchsia-400/25 bg-fuchsia-500/5 p-5 text-white sm:p-6">
      <h2 className="text-xl font-semibold">Earlier team-level requests {requests.length > 0 && <span className="ml-2 rounded-full bg-fuchsia-500/20 px-3 py-1 text-sm">{requests.length} pending</span>}</h2>
      <p className="text-sm leading-6 text-white/65">Earlier requests for a saved team preference are retained here. Approval saves the preference, but does not accept a particular camera slot. New one-match requests are reviewed under Fixture requests and filming decisions below. Existing charges are unchanged and no email or SMS is sent.</p>
      {requests.length === 0 ? <p className="text-sm text-white/60">No requests awaiting approval.</p> : <ul className="space-y-4">{requests.map(request => <li key={request.id} className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
        <div><Link href={`/admin/teams/${request.teamId}`} className="font-semibold hover:underline">{request.teamName}</Link><p className="mt-1 text-sm text-white/60">Requested {new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' }).format(request.requestedAt)} · £5 supplement agreed</p></div>
        <ReviewRequestForm leagueId={id} requestId={request.id} />
      </li>)}</ul>}
    </section>
    {children}
  </div>;
}
