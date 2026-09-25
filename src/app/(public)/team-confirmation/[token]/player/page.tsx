import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { canChooseIndividualPlayer } from "@/lib/leads/team-lead-player-choice";
import { getTeamPlaceConfirmationStatus, verifyTeamPlaceConfirmationToken } from "@/lib/leads/teamPlaceConfirmation";
import { chooseIndividualPlayerAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Join as an individual player | SIXFL", robots: { index: false, follow: false } };

/** Opening an email link is read-only. Only the explicitly labelled form POST
 * below changes the original enquiry; link scanners cannot register a decision. */
export default async function IndividualPlayerChoicePage({ params, searchParams }: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const sp = (await searchParams) ?? {};
  const leadId = verifyTeamPlaceConfirmationToken(token);
  const lead = leadId ? await prisma.interestLead.findUnique({
    where: { id: leadId },
    select: {
      id: true, contactName: true, interestType: true, status: true, convertedTeamId: true, convertedAt: true,
      league: { select: { name: true } },
    },
  }) : null;
  const confirmation = lead ? await getTeamPlaceConfirmationStatus(lead.id) : null;
  const alreadyPlayer = lead?.interestType === "PLAYER" && !lead.convertedTeamId;
  const canChoose = lead ? canChooseIndividualPlayer({ ...lead, confirmationStatus: confirmation?.status ?? null }) : false;
  const firstName = lead?.contactName?.trim().split(/\s+/)[0] || "there";
  const errorMessage = sp.error === "save"
    ? "We could not save your choice. Nothing has been confirmed here — please try again or reply to the SIXFL email."
    : sp.error === "confirm" ? "Please use the confirmation button below to record your choice."
    : sp.error ? "This enquiry has changed. Please reply to the SIXFL email and we’ll help." : null;

  return (
    <main className="min-h-screen bg-[#07130f] px-4 py-10 text-white">
      <section className="mx-auto max-w-xl rounded-3xl border border-emerald-400/20 bg-white/[0.04] p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-200">SIXFL · Individual players</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          {!lead ? "This link is not valid" : alreadyPlayer ? "Your player interest is recorded" : canChoose ? `Hi ${firstName} — just looking to play yourself?` : "Please contact SIXFL about this enquiry"}
        </h1>
        {lead?.league ? <p className="mt-2 text-sm text-emerald-100/80">{lead.league.name}</p> : null}
        {alreadyPlayer ? (
          <div className="mt-5 space-y-4 text-sm leading-6 text-white/75" role="status">
            <p>Your enquiry is recorded as an individual-player enquiry, not a team entry. We have kept your existing contact details and league preference.</p>
            <p>You will not receive further team-registration chases for this enquiry. SIXFL will follow up about player opportunities; a place in a team is not yet confirmed.</p>
          </div>
        ) : canChoose ? (
          <div className="mt-5 space-y-5">
            <p className="text-sm leading-6 text-white/75">We already have your contact details. Confirm below to tell us that you are looking to join a team as an individual player, rather than enter a whole team.</p>
            <p className="text-sm leading-6 text-white/65">We’ll update your existing enquiry and stop chasing you for a team entry. This does not create a player account, put you into a squad or take a payment.</p>
            {errorMessage ? <p role="alert" className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">{errorMessage}</p> : null}
            <form action={chooseIndividualPlayerAction}>
              <input type="hidden" name="token" value={token} />
              <button name="confirmPlayerInterest" value="yes" type="submit" className="min-h-12 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-500">
                Yes — register my interest as a player
              </button>
            </form>
            <Link href={`/team-confirmation/${encodeURIComponent(token)}`} className="block py-3 text-center text-sm font-semibold text-emerald-200 underline">I’m entering a team instead</Link>
          </div>
        ) : (
          <p className="mt-5 text-sm leading-6 text-white/75">{lead ? "This enquiry has already been confirmed, closed or processed. We have not changed it. Please reply to your SIXFL email so we can help with your next step." : "Please reply to the SIXFL email and we’ll send you a fresh link."}</p>
        )}
      </section>
    </main>
  );
}
