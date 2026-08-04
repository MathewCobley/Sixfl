import Link from "next/link";

export const metadata = {
  title: "Player Referral Terms | SIXFL",
  description: "Terms for the SIXFL £75 player team referral reward.",
};

const terms = [
  [
    "Who can refer a team",
    "The reward is available to registered SIXFL players with an active player account and personal referral code.",
  ],
  [
    "Eligible teams",
    "The referred team must be new to SIXFL and must enter the player’s referral code when first registering its interest. A referral cannot normally be added after registration.",
  ],
  [
    "Reward amount",
    "One £75 reward is available for each eligible referred team. The reward is paid to the player whose valid code was used at registration.",
  ],
  [
    "Three-match requirement",
    "The reward becomes payable only after the referred team has completed three SIXFL league matches. Cancelled, postponed, abandoned or unplayed fixtures do not count.",
  ],
  [
    "Payment",
    "SIXFL will check that the referral qualifies before marking the reward as payable. Payment may require the player to provide suitable payment details.",
  ],
  [
    "Self-referrals and misuse",
    "Players cannot refer themselves or use duplicate, false or misleading registrations. SIXFL may reject or withdraw a reward where the scheme has been misused.",
  ],
  [
    "Team changes",
    "If the referred team withdraws, is removed, merges with an existing team or does not complete three qualifying matches, no reward is due.",
  ],
  [
    "Scheme changes",
    "SIXFL may amend, pause or withdraw the referral scheme. Referrals already validly recorded will be considered under the terms shown when the team registered.",
  ],
] as const;

export default function ReferralTermsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-400">
            SIXFL rewards
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
            Player referral terms and conditions
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-white/65">
            These terms apply to the SIXFL offer where a registered player can earn £75 for referring a new team that completes three matches.
          </p>
        </div>

        <div className="space-y-4">
          {terms.map(([title, body], index) => (
            <section
              key={title}
              className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 sm:p-6"
            >
              <h2 className="text-lg font-black text-white">
                {index + 1}. {title}
              </h2>
              <p className="mt-2 text-sm leading-7 text-white/65">{body}</p>
            </section>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/player/referrals"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-emerald-400 px-5 text-sm font-black text-slate-950 hover:bg-emerald-300"
          >
            Back to referral offer
          </Link>
          <Link
            href="/contact"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-5 text-sm font-bold text-white hover:bg-white/10"
          >
            Ask a question
          </Link>
        </div>

        <p className="text-xs leading-5 text-white/35">
          Version 1.0 · Last updated 5 August 2026
        </p>
      </div>
    </main>
  );
}
