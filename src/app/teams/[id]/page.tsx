// ========================================
// File: src/app/teams/[id]/page.tsx
// ========================================

import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

// ========================================
// Types
// ========================================

type PageProps = {
  params: Promise<{ id: string }>;
};

// ========================================
// Helpers
// ========================================

function normaliseLogoUrl(value?: string | null) {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/")
  ) {
    return trimmed;
  }

  return `/${trimmed}`;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatPreferredNight(value?: string | null) {
  if (!value) return "TBC";
  if (value === "ANY") return "Any night";
  return value.charAt(0) + value.slice(1).toLowerCase();
}

// ========================================
// Page
// ========================================

export default async function TeamPage({ params }: PageProps) {
  const { id } = await params;

  const team = await prisma.team.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      league: {
        select: {
          name: true,
          slug: true,
          heroImageUrl: true,
          venueName: true,
          area: true,
          dayOfWeek: true,
        },
      },
    },
  });

  if (!team) notFound();

  const teamLogo = normaliseLogoUrl(team.logoUrl);
  const leagueHero =
    normaliseLogoUrl(team.league?.heroImageUrl) ||
    "/venues/rossett_dark_trendy.jpg";

  const leagueBadge = "/sixfl-badge.png";

  const nightLabel = formatPreferredNight(team.league?.dayOfWeek);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* ======================================== */}
      {/* HERO */}
      {/* ======================================== */}

      <section className="relative isolate min-h-[70vh] overflow-hidden border-b border-white/10">
        <Image
          src={leagueHero}
          alt=""
          fill
          priority
          className="object-cover object-center"
        />

        <div className="absolute inset-0 bg-black/75" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/90 via-black/60 to-black" />

        <div className="relative mx-auto max-w-6xl px-6 py-16 sm:px-10 sm:py-24">
          {/* Breadcrumb */}
          <div className="text-sm text-white/60">
            <Link href="/leagues" className="hover:text-white">
              Leagues
            </Link>
            {team.league && (
              <>
                {" / "}
                <Link
                  href={`/leagues/${team.league.slug}`}
                  className="hover:text-white"
                >
                  {team.league.name}
                </Link>
              </>
            )}
          </div>

          {/* League Badge */}
          <div className="mt-6 flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-xl" />
              <Image
                src={leagueBadge}
                alt="League badge"
                width={80}
                height={80}
                className="relative object-contain"
              />
            </div>

            <span className="text-sm uppercase tracking-[0.25em] text-emerald-400">
              SIXFL Team
            </span>
          </div>

          {/* Team */}
          <div className="mt-8 flex items-center gap-6">
            <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5">
              {teamLogo ? (
                <Image
                  src={teamLogo}
                  alt={team.name}
                  fill
                  className="object-contain p-2"
                />
              ) : (
                <span className="text-3xl font-black text-white/60">
                  {getInitials(team.name)}
                </span>
              )}
            </div>

            <h1 className="text-4xl font-black sm:text-5xl lg:text-6xl">
              {team.name}
            </h1>
          </div>

          {/* Info */}
          <div className="mt-6 max-w-xl text-white/70">
            Playing in{" "}
            <span className="font-semibold text-white">
              {team.league?.name}
            </span>{" "}
            — {nightLabel} nights at{" "}
            {team.league?.venueName || team.league?.area || "TBC"}.
          </div>

          {/* CTA */}
          <div className="mt-8 flex gap-4">
            {team.league && (
              <Link
                href={`/leagues/${team.league.slug}`}
                className="rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-black hover:bg-emerald-400"
              >
                View league
              </Link>
            )}

            <Link
              href="/leagues"
              className="rounded-xl border border-white/20 px-6 py-3 font-semibold hover:bg-white/10"
            >
              All leagues
            </Link>
          </div>
        </div>
      </section>

      {/* ======================================== */}
      {/* BODY (placeholder for now) */}
      {/* ======================================== */}

      <section className="mx-auto max-w-6xl px-6 py-12 text-white/60">
        Team stats, fixtures, and results will go here.
      </section>
    </div>
  );
}