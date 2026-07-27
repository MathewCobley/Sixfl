// ========================================
// File: src/app/(public)/player-pool/page.tsx
// ========================================

import type { Metadata } from "next";
import Image from "next/image";

import PlayerPoolProfileForm from "@/components/player-pool/PlayerPoolProfileForm";

export const metadata: Metadata = {
  title: "SIXFL PlayerPool | Find a 6-a-side team",
  description:
    "Join SIXFL PlayerPool and let local teams see your anonymised football profile when they need an extra player.",
};

type SearchParams = Promise<{ error?: string }>;

export default async function PlayerPoolPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = (await searchParams) ?? {};

  return (
    <main className="min-h-screen bg-black px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <section className="overflow-hidden rounded-[2rem] border border-emerald-400/20 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] shadow-[0_28px_100px_rgba(0,0,0,0.48)]">
          <div className="border-b border-white/10 px-6 py-8 sm:px-9 sm:py-10">
            <div className="relative h-24 w-full max-w-md sm:h-28">
              <Image
                src="/logos/sixfl player pool .png"
                alt="SIXFL PlayerPool"
                fill
                priority
                sizes="(max-width: 640px) 90vw, 448px"
                className="object-contain object-left"
              />
            </div>
            <div className="mt-5 inline-flex rounded-full border border-emerald-400/25 bg-emerald-500/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-emerald-300">
              SIXFL PlayerPool
            </div>
            <h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight tracking-tight sm:text-5xl">
              Find a team without sharing your contact details publicly.
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-white/70 sm:text-lg">
              Complete one quick playing profile. Relevant SIXFL captains can see your age group, positions, football experience and availability, but not your name, email address or mobile number.
            </p>
            <div className="mt-6 grid gap-3 text-sm text-white/75 sm:grid-cols-3">
              {[
                "Create an anonymised profile",
                "Captains request an introduction",
                "SIXFL puts you in touch only after you agree",
              ].map((item, index) => (
                <div
                  key={item}
                  className="rounded-2xl border border-white/10 bg-black/25 p-4"
                >
                  <div className="text-xs font-black text-emerald-300">0{index + 1}</div>
                  <div className="mt-2 leading-6">{item}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="px-6 py-8 sm:px-9 sm:py-10">
            <PlayerPoolProfileForm error={params.error ?? null} />
          </div>
        </section>
      </div>
    </main>
  );
}
