import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { declinePlayerPoolAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Still looking for a SIXFL team?", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function PlayerPoolResponsePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-zA-Z0-9-]{20,100}$/.test(token)) notFound();
  const rows = await prisma.$queryRaw<Array<{ status: string; profileSubmittedAt: Date | null }>>`
    SELECT status,"profileSubmittedAt" FROM "PlayerPoolProfile" WHERE "profileToken"=${token}
  `;
  const profile = rows[0];
  if (!profile) notFound();
  const closed = profile.status === "NOT_LOOKING";
  const awaiting = profile.status === "INVITED" && !profile.profileSubmittedAt;
  return <main className="min-h-screen bg-black px-4 py-12 text-white">
    <section className="mx-auto max-w-xl space-y-5 rounded-3xl border border-emerald-400/25 bg-emerald-950/30 p-7">
      <p className="text-xs font-bold uppercase tracking-widest text-emerald-200">SIXFL PlayerPool</p>
      <h1 className="text-3xl font-black">{closed ? "Your PlayerPool enquiry is closed" : awaiting ? "Still looking for a team?" : "Your PlayerPool status has changed"}</h1>
      <p className="leading-7 text-white/75">{closed ? "Thanks for letting us know. We have marked you as not looking and stopped these profile chases. This does not affect any team registration or payment." : awaiting ? "Either answer is fine. To be introduced to suitable teams, you need to complete your short football profile. This is free and does not commit you to joining a team." : "You are no longer awaiting a profile, so this old chase link cannot close or change your current registration. Contact SIXFL for help."}</p>
      {awaiting ? <div className="space-y-3">
        <Link href={`/player-pool/profile/${encodeURIComponent(token)}`} className="block rounded-xl bg-emerald-400 px-5 py-4 text-center font-bold text-black">Yes — complete my profile</Link>
        <form action={declinePlayerPoolAction}>
          <input type="hidden" name="token" value={token} />
          <button className="w-full rounded-xl border border-white/25 px-5 py-4 font-bold hover:bg-white/10">No — close my PlayerPool enquiry</button>
        </form>
        <p className="text-sm text-white/50">Choosing No stops these reminders. Simply opening this page changes nothing.</p>
      </div> : null}
    </section>
  </main>;
}
