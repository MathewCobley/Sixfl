import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { declineResponseAction } from "./actions";
export const dynamic = "force-dynamic";
export const metadata = { title: "Still looking for a SIXFL team?", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function PlayerPoolResponsePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length > 200) notFound();
  const rows = await prisma.$queryRaw<Array<{ status: string; profileSubmittedAt: Date | null }>>`
    SELECT status, "profileSubmittedAt" FROM "PlayerPoolProfile" WHERE "profileToken" = ${token} LIMIT 1
  `;
  const profile = rows[0];
  if (!profile) notFound();
  const awaiting = profile.status === "INVITED" && !profile.profileSubmittedAt;
  return <main className="mx-auto max-w-2xl space-y-5 px-5 py-12 text-white">
    <h1 className="text-3xl font-black">Still looking for a SIXFL team?</h1>
    {profile.status === "NOT_LOOKING" ? <p role="status">Thanks for letting us know. Your PlayerPool enquiry is closed and profile reminders have stopped. We have not deleted your account or changed any team registration.</p>
      : awaiting ? <>
        <p className="leading-7 text-white/75">Either answer is absolutely fine. To help find you a team, we need your preferred area, playing nights and a few football details. Completing your profile is free and does not commit you to joining a team.</p>
        <Link href={`/player-pool/profile/${encodeURIComponent(token)}`} className="block rounded-xl bg-emerald-400 p-4 text-center font-bold text-black">Yes — complete my player profile</Link>
        <form action={declineResponseAction.bind(null, token)}>
          <p className="mb-3 text-sm text-white/65">Choosing the button below confirms that you are no longer looking and stops these PlayerPool reminders.</p>
          <button type="submit" className="w-full rounded-xl border border-white/20 p-4 font-bold">No — I am no longer looking</button>
        </form>
        <p className="text-sm text-white/60">Without a response and a completed profile, we cannot introduce you to a team. Questions or problems with the form? Reply to the email and SIXFL will help.</p>
      </> : <p>Your profile is no longer awaiting a response. There is nothing to confirm here. Please contact SIXFL for help with your current status.</p>}
  </main>;
}
