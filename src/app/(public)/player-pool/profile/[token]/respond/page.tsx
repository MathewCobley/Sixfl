import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { declineAwaitingPlayerPoolProfile } from "@/lib/player-pool/response-reminders";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your PlayerPool response | SIXFL", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function PlayerPoolResponsePage({ params, searchParams }: {
  params: Promise<{ token: string }>; searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { token } = await params;
  if (!token || token.length > 256) notFound();
  const [profile] = await prisma.$queryRaw<Array<{ status: string; profileSubmittedAt: Date | null }>>`
    SELECT status,"profileSubmittedAt" FROM "PlayerPoolProfile" WHERE "profileToken"=${token}
  `;
  if (!profile) notFound();
  const query = await searchParams;
  const path = `/player-pool/profile/${encodeURIComponent(token)}`;
  async function confirm(form: FormData) {
    "use server";
    if (form.get("confirm") !== "yes") redirect(`${path}/respond?error=confirm`);
    const saved = await declineAwaitingPlayerPoolProfile(token);
    revalidatePath("/admin/player-pool");
    redirect(`${path}/respond?${saved ? "saved=yes" : "error=changed"}`);
  }
  const closed = profile.status === "NOT_LOOKING";
  const awaiting = profile.status === "INVITED" && !profile.profileSubmittedAt;
  return <main className="min-h-screen bg-black px-4 py-12 text-white">
    <section className="mx-auto max-w-xl space-y-5 rounded-3xl border border-emerald-400/25 bg-white/5 p-6 sm:p-9">
      <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">SIXFL PlayerPool</p>
      <h1 className="text-3xl font-black">{closed ? "Thanks for letting us know" : "No longer looking for a team?"}</h1>
      {closed ? <p>Your PlayerPool enquiry is now marked as not looking. No further profile reminders will be sent. Your existing team memberships and payments are unchanged.</p> : !awaiting ? <p>This profile is no longer awaiting completion. No change has been made. Please contact SIXFL to discuss your current playing arrangements.</p> : <>
        <p>That is absolutely fine. Confirm below to close this PlayerPool enquiry and stop its profile reminders. This will not remove you from an existing team or delete your account.</p>
        {query.error ? <p role="alert" className="text-amber-200">Please confirm your choice below. Nothing has been changed.</p> : null}
        <form action={confirm} className="space-y-5">
          <label className="flex items-start gap-3"><input type="checkbox" name="confirm" value="yes" required className="mt-1 h-5 w-5" /><span>I am no longer looking for a team through PlayerPool.</span></label>
          <button className="min-h-12 w-full rounded-xl bg-emerald-400 px-5 py-3 font-bold text-black">Confirm — stop PlayerPool reminders</button>
        </form>
      </>}
      <Link className="inline-block underline underline-offset-4" href={path}>Still interested? Complete or update your profile</Link>
    </section>
  </main>;
}
