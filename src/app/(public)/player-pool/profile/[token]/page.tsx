// ========================================
// File: src/app/(public)/player-pool/profile/[token]/page.tsx
// ========================================

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import PlayerPoolProfileForm from "@/components/player-pool/PlayerPoolProfileForm";
import { prisma } from "@/lib/prisma";
import {
  ensurePlayerPoolTables,
  readPlayerPoolStringArray,
} from "@/lib/player-pool/storage";

export const metadata: Metadata = {
  title: "Complete your SIXFL PlayerPool profile",
};

type ProfileRow = {
  profileToken: string;
  area: string | null;
  leagueId: string | null;
  preferredPosition: string | null;
  consentShareProfile: boolean;
  consentContact: boolean;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  ageBand: string | null;
  preferredPositions: string | null;
  experienceSummary: string | null;
  availabilityLevel: string | null;
  preferredNights: unknown;
  availabilitySummary: string | null;
  leagueName: string | null;
};

type SearchParams = Promise<{ error?: string }>;

export default async function PlayerPoolProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: SearchParams;
}) {
  await ensurePlayerPoolTables();

  const { token } = await params;
  const query: { error?: string } = searchParams ? await searchParams : {};

  const rows = await prisma.$queryRaw<ProfileRow[]>`
    SELECT
      pp."profileToken",
      pp."area",
      pp."leagueId",
      pp."preferredPosition",
      pp."consentShareProfile",
      pp."consentContact",
      prospect."firstName",
      prospect."lastName",
      prospect."email",
      prospect."phone",
      prospect."ageBand",
      prospect."preferredPositions",
      prospect."experienceSummary",
      prospect."availabilityLevel",
      prospect."preferredNights",
      prospect."availabilitySummary",
      league."name" AS "leagueName"
    FROM "PlayerPoolProfile" pp
    JOIN "TeamPlayerProspect" prospect ON prospect."id" = pp."prospectId"
    LEFT JOIN "League" league ON league."id" = pp."leagueId"
    WHERE pp."profileToken" = ${token}
    LIMIT 1
  `;

  const profile = rows[0];
  if (!profile) notFound();

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  const positions = profile.preferredPositions
    ? profile.preferredPositions.split(",").map((value) => value.trim()).filter(Boolean)
    : [];

  return (
    <main className="min-h-screen bg-black px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <section className="overflow-hidden rounded-[2rem] border border-emerald-400/20 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] shadow-[0_28px_100px_rgba(0,0,0,0.48)]">
          <div className="border-b border-white/10 px-6 py-8 sm:px-9 sm:py-10">
            <div className="inline-flex rounded-full border border-emerald-400/25 bg-emerald-500/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-emerald-300">
              SIXFL PlayerPool
            </div>
            <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">
              Complete your player profile
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-white/70">
              This takes around two minutes. Captains will see only your anonymised football profile. Your contact details remain private until you agree to an introduction.
            </p>
          </div>

          <div className="px-6 py-8 sm:px-9 sm:py-10">
            <PlayerPoolProfileForm
              error={query.error ?? null}
              defaults={{
                profileToken: profile.profileToken,
                fullName,
                email: profile.email ?? "",
                phone: profile.phone ?? "",
                ageBand: profile.ageBand ?? undefined,
                positions,
                preferredPosition: profile.preferredPosition ?? undefined,
                experienceSummary: profile.experienceSummary ?? undefined,
                availabilityLevel: profile.availabilityLevel ?? undefined,
                preferredNights: readPlayerPoolStringArray(profile.preferredNights),
                area: profile.area ?? "",
                leagueId: profile.leagueId,
                leagueName: profile.leagueName,
                availabilitySummary: profile.availabilitySummary ?? "",
                consentShareProfile: profile.consentShareProfile,
                consentContact: profile.consentContact,
              }}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
