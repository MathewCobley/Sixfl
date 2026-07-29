// ========================================
// File: src/app/leagues/thanks/page.tsx
// ========================================

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getLeadId(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function LeagueThanksPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const leadId = getLeadId(params.lead).trim();

  const lead = leadId
    ? await prisma.interestLead.findUnique({
        where: { id: leadId },
        select: {
          league: {
            select: {
              name: true,
              season: true,
            },
          },
        },
      })
    : null;

  const leagueLabel = lead?.league
    ? `${lead.league.name}${lead.league.season ? ` · ${lead.league.season}` : ""}`
    : "your selected SIXFL league";

  return (
    <div className="min-h-screen bg-black text-white">
      <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 sm:p-12">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
            SIXFL
          </p>

          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
            Thanks for registering your interest
          </h1>

          <p className="mt-4 text-white/70">
            We&apos;ve received your details and will be in touch soon about {leagueLabel}.
          </p>
        </div>
      </section>
    </div>
  );
}
