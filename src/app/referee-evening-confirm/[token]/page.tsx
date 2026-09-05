import Link from "next/link";
import { ARRIVAL_LEAD } from "@/lib/referees/evening-policy";
import { formatEveningDate, formatEveningTime, getEveningConfirmation } from "@/lib/referees/evening-notifications";
import { respondToEveningAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Confirm your referee evening | SIXFL", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function RefereeEveningConfirmationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Viewing a link (including an email security scanner) never records an answer.
  const context = await getEveningConfirmation(token);
  const answered = Boolean(context?.row.consumedAt);
  return (
    <main className="min-h-screen bg-black px-4 py-10 text-white">
      <section className="mx-auto max-w-xl rounded-2xl border border-white/15 p-6">
        <p className="text-sm font-semibold text-emerald-400">SIXFL referees</p>
        <h1 className="mt-3 text-2xl font-bold">{!context ? "This booking link is no longer current" : answered ? "Your response is recorded" : "Can you referee this evening?"}</h1>
        {!context ? <p className="mt-4 text-white/70">The booking may have changed or ended. Please use the latest booking message or open your dashboard.</p> : <>
          <p className="mt-4 font-semibold">{formatEveningDate(context.row.nightDate)}</p>
          {context.snapshot.segments.map((segment, index) => <div key={`${segment.venueId}-${index}`} className="mt-4 rounded-xl bg-white/5 p-4">
            <h2 className="font-semibold">{segment.venueName || "Venue TBC"}</h2>
            {segment.venueAddress && <p className="text-sm text-white/60">{segment.venueAddress}</p>}
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <dt>Please arrive by</dt><dd>{formatEveningTime(new Date(Date.parse(segment.first) - ARRIVAL_LEAD).toISOString())}</dd>
              <dt>First kick-off</dt><dd>{formatEveningTime(segment.first)}</dd>
              <dt>Last kick-off</dt><dd>{formatEveningTime(segment.last)}</dd>
              <dt>Expected finish</dt><dd>{formatEveningTime(segment.finish)}</dd>
            </dl>
          </div>)}
          {answered ? <p role="status" className="mt-5 font-semibold">{context.row.confirmationStatus === "CONFIRMED" ? "Thank you — you have confirmed you can attend." : "You have told SIXFL you are unavailable."}</p> : <form action={respondToEveningAction} className="mt-6 flex flex-wrap gap-3">
            <input type="hidden" name="token" value={token} />
            <button type="submit" name="answer" value="yes" className="rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-black">Yes, I can attend</button>
            <button type="submit" name="answer" value="no" className="rounded-xl border border-white/30 px-5 py-3 font-semibold">No, I am unavailable</button>
          </form>}
        </>}
        <Link href="/referee" className="mt-6 inline-block text-emerald-400 underline">Open referee dashboard</Link>
      </section>
    </main>
  );
}
