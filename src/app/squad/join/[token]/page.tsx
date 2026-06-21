// ========================================
// File: src/app/squad/join/[token]/page.tsx
// ========================================

import Link from "next/link";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { verifySquadActivationToken } from "@/lib/squad/activationToken";
import { upsertTeamMemberProfileFromProspect } from "@/lib/teamMemberProfiles";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Join Squad | SIXFL",
};

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ confirmed?: string }>;
};

function getInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "S"
  );
}

function getProspectFullName(input: { firstName: string; lastName: string | null }) {
  return [input.firstName, input.lastName].filter(Boolean).join(" ").trim();
}

function formatPreferredNight(value: string | null | undefined) {
  if (!value || value === "ANY") return null;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function getTeamContextLine(team: {
  name: string;
  league: {
    name: string;
    season: string | null;
    dayOfWeek: string | null;
    venueName: string | null;
  } | null;
}) {
  const night = formatPreferredNight(team.league?.dayOfWeek);
  const venueName = team.league?.venueName?.trim();

  if (night && venueName) {
    return `${team.name} plays on a ${night} night at ${venueName}.`;
  }

  if (night) {
    return `${team.name} plays on a ${night} night.`;
  }

  if (venueName) {
    return `${team.name} plays at ${venueName}.`;
  }

  return `${team.name} is a managed SIXFL squad.`;
}

async function confirmManagedSquadJoinAction(formData: FormData) {
  "use server";

  const token = String(formData.get("token") ?? "").trim();
  const prospectId = verifySquadActivationToken(token);

  if (!prospectId) {
    throw new Error("This join link is not valid.");
  }

  const prospect = await prisma.teamPlayerProspect.findUnique({
    where: { id: prospectId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      ageBand: true,
      preferredPositions: true,
      experienceSummary: true,
      availabilityLevel: true,
      preferredNights: true,
      availabilitySummary: true,
      notes: true,
      status: true,
      teamId: true,
      team: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!prospect) {
    throw new Error("This squad invite could not be found.");
  }

  if (!prospect.teamId || !prospect.team) {
    throw new Error("This squad invite is no longer assigned to a team.");
  }

  const prospectTeamId = prospect.teamId;

  if (prospect.status === "DECLINED") {
    throw new Error("This squad invite is no longer active.");
  }

  const email = prospect.email?.trim().toLowerCase() ?? null;

  if (!email) {
    throw new Error("This squad invite does not have an email address attached.");
  }

  const fullName = getProspectFullName(prospect) || email;

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email },
      update: {
        name: fullName,
      },
      create: {
        email,
        name: fullName,
      },
      select: {
        id: true,
      },
    });

    const membership = await tx.teamMember.upsert({
      where: {
        userId_teamId: {
          userId: user.id,
          teamId: prospectTeamId,
        },
      },
      update: {
        role: "PLAYER",
      },
      create: {
        userId: user.id,
        teamId: prospectTeamId,
        role: "PLAYER",
      },
      select: {
        id: true,
      },
    });

    await upsertTeamMemberProfileFromProspect({
      client: tx,
      teamMemberId: membership.id,
      prospect: {
        id: prospect.id,
        phone: prospect.phone,
        ageBand: prospect.ageBand,
        preferredPositions: prospect.preferredPositions,
        experienceSummary: prospect.experienceSummary,
        availabilityLevel: prospect.availabilityLevel,
        preferredNights: prospect.preferredNights,
        availabilitySummary: prospect.availabilitySummary,
        notes: prospect.notes,
      },
    });

    await tx.teamPlayerProspect.update({
      where: { id: prospect.id },
      data: {
        status: "ACTIVE_SQUAD",
        lastContactedAt: new Date(),
      },
    });
  });

  revalidatePath(`/admin/teams/${prospectTeamId}`);
  revalidatePath(`/admin/teams/${prospectTeamId}/squad`);
  revalidatePath(`/admin/teams/${prospectTeamId}/prospects`);
  revalidatePath(`/captain/team/${prospectTeamId}/squad`);
  revalidatePath(`/captain/team/${prospectTeamId}/prospects`);
}

function InvalidLinkCard() {
  return (
    <main className="min-h-screen bg-[#07130f] px-4 py-10 text-white">
      <section className="mx-auto max-w-2xl rounded-3xl border border-red-400/20 bg-red-500/10 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-red-200/80">
          Squad invite
        </p>
        <h1 className="mt-3 text-2xl font-semibold">This join link is not valid</h1>
        <p className="mt-3 text-sm leading-6 text-red-100/80">
          Please ask SIXFL to send you a fresh squad invite.
        </p>
      </section>
    </main>
  );
}

export default async function ManagedSquadJoinPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const prospectId = verifySquadActivationToken(token);

  if (!prospectId) {
    return <InvalidLinkCard />;
  }

  const prospect = await prisma.teamPlayerProspect.findUnique({
    where: { id: prospectId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      status: true,
      teamId: true,
      team: {
        select: {
          id: true,
          name: true,
          logoUrl: true,
          league: {
            select: {
              name: true,
              season: true,
              dayOfWeek: true,
              venueName: true,
            },
          },
        },
      },
    },
  });

  if (!prospect?.teamId || !prospect.team) {
    return <InvalidLinkCard />;
  }

  const prospectTeamId = prospect.teamId;
  const fullName = getProspectFullName(prospect);
  const displayName = fullName || prospect.email || "Your squad place";
  const isConfirmed = resolvedSearchParams.confirmed === "1" || prospect.status === "ACTIVE_SQUAD";
  const isDeclined = prospect.status === "DECLINED";
  const leagueLabel = prospect.team.league
    ? `${prospect.team.league.name}${prospect.team.league.season ? ` · ${prospect.team.league.season}` : ""}`
    : null;

  return (
    <main className="min-h-screen bg-[#07130f] px-4 py-10 text-white">
      <div className="mx-auto max-w-3xl space-y-6">
        <section className="rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            SIXFL squad invite
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            {isConfirmed ? "You’re on the squad list" : `Join ${prospect.team.name}`}
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/70">
            {isConfirmed
              ? `Thanks ${prospect.firstName}, your place with ${prospect.team.name} has been confirmed.`
              : `You’ve been added to the ${prospect.team.name} squad list. Tap once below to confirm you still want to join.`}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            {leagueLabel ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                {leagueLabel}
              </span>
            ) : null}
            {prospect.team.league?.dayOfWeek ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                {formatPreferredNight(prospect.team.league.dayOfWeek)} nights
              </span>
            ) : null}
            {prospect.team.league?.venueName ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                {prospect.team.league.venueName}
              </span>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-black text-white/70">
              {getInitials(displayName)}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">{displayName}</h2>
              <p className="mt-1 text-sm leading-6 text-white/60">
                {getTeamContextLine(prospect.team)}
              </p>
            </div>
          </div>

          {isDeclined ? (
            <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100/80">
              This invite has been marked as declined. Please contact SIXFL if this is wrong.
            </div>
          ) : isConfirmed ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-100/80">
                You’re confirmed. We’ll send fixture availability messages when games are coming up.
              </div>
              <Link
                href={`/player/team/${prospectTeamId}`}
                className="inline-flex rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
              >
                Go to team area
              </Link>
            </div>
          ) : (
            <form
              action={async (formData) => {
                "use server";
                await confirmManagedSquadJoinAction(formData);
              }}
              className="mt-6 space-y-3"
            >
              <input type="hidden" name="token" value={token} />
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(16,185,129,0.24)] transition hover:bg-emerald-500 sm:w-auto"
              >
                Yes, I want to join
              </button>
              <p className="text-xs leading-5 text-white/50">
                This confirms your squad place using {prospect.email ?? "the email address on your invite"}. No long form needed.
              </p>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
