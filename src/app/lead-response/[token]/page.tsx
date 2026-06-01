// ========================================
// File: src/app/lead-response/[token]/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { LeadStatus } from "@prisma/client";

import { parseLeadResponseToken } from "@/lib/leads/responseLinks";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type LeadResponsePageProps = {
  params: Promise<{
    token: string;
  }>;
};

function getFirstName(value: string) {
  return value.trim().split(/\s+/)[0] || "there";
}

export default async function LeadResponsePage({ params }: LeadResponsePageProps) {
  const { token } = await params;
  const parsedToken = parseLeadResponseToken(token);

  if (!parsedToken) {
    notFound();
  }

  const lead = await prisma.interestLead.findUnique({
    where: {
      id: parsedToken.leadId,
    },
    select: {
      id: true,
      contactName: true,
      email: true,
      status: true,
      interestType: true,
      league: {
        select: {
          name: true,
          season: true,
          slug: true,
        },
      },
    },
  });

  if (!lead) {
    notFound();
  }

  const respondedAt = new Date();

  if (parsedToken.action === "yes") {
    await prisma.interestLead.update({
      where: {
        id: lead.id,
      },
      data: {
        status: LeadStatus.QUALIFIED,
        contactedAt: respondedAt,
        closedAt: null,
      },
    });
  } else {
    await prisma.interestLead.update({
      where: {
        id: lead.id,
      },
      data: {
        status: LeadStatus.CLOSED,
        closedAt: respondedAt,
      },
    });
  }

  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${lead.id}`);
  revalidatePath("/admin/messaging");

  const firstName = getFirstName(lead.contactName);
  const leagueLabel = lead.league
    ? `${lead.league.name}${lead.league.season ? ` · ${lead.league.season}` : ""}`
    : "SIXFL";
  const leagueHref = lead.league?.slug ? `/leagues/${lead.league.slug}` : "/register-interest";
  const isYes = parsedToken.action === "yes";

  return (
    <main className="min-h-screen bg-[#07130f] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center">
        <section className="w-full overflow-hidden rounded-[2rem] border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.22),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04))] p-6 shadow-[0_28px_100px_rgba(0,0,0,0.42)] md:p-9">
          <div className="inline-flex rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">
            Response saved
          </div>

          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-white sm:text-5xl">
            {isYes ? `Thanks ${firstName}, you’re still on the squad list.` : `No problem ${firstName}, we’ve updated your details.`}
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-7 text-white/68">
            {isYes
              ? "We’ve recorded that you still want to play. SIXFL will keep you on the player list and contact you when the next squad place is ready."
              : "We’ve recorded that you no longer want to be contacted about joining a squad, so we’ll remove you from this player list."}
          </p>

          <div className="mt-7 rounded-3xl border border-white/10 bg-black/20 p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
              League
            </div>
            <div className="mt-2 text-lg font-semibold text-white">{leagueLabel}</div>
            {lead.email ? <div className="mt-1 text-sm text-white/45">{lead.email}</div> : null}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            {isYes ? (
              <Link
                href={leagueHref}
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300"
              >
                View league details
              </Link>
            ) : null}
            <Link
              href="/"
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-6 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
            >
              Back to SIXFL
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
