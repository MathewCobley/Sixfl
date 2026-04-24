// ========================================
// File: src/app/squad/activate/[token]/page.tsx
// ========================================

import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { verifySquadActivationToken } from "@/lib/squad/activationToken";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Activate Squad Place | SIXFL",
};

type PageProps = {
  params: Promise<{ token: string }>;
};

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "S";
}

function buildLoginUrl(input: { token: string; email: string | null }) {
  const callbackUrl = `/squad/activate/${encodeURIComponent(input.token)}`;
  const params = new URLSearchParams({ callbackUrl });

  if (input.email) {
    params.set("email", input.email);
  }

  return `/login?${params.toString()}`;
}

export default async function SquadActivationPage({ params }: PageProps) {
  const { token } = await params;
  const prospectId = verifySquadActivationToken(token);

  if (!prospectId) {
    return (
      <div className="min-h-screen bg-[#07130f] px-4 py-10 text-white">
        <div className="mx-auto max-w-2xl rounded-[2rem] border border-red-400/20 bg-red-500/10 p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-red-200/80">
            Activation link
          </p>
          <h1 className="mt-3 text-2xl font-semibold">This activation link is not valid</h1>
          <p className="mt-3 text-sm leading-6 text-red-100/80">
            Please ask your team organiser to send you a fresh squad activation email.
          </p>
        </div>
      </div>
    );
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
              venueName: true,
              dayOfWeek: true,
            },
          },
        },
      },
    },
  });

  if (!prospect || prospect.status !== "ACTIVE_SQUAD") {
    return (
      <div className="min-h-screen bg-[#07130f] px-4 py-10 text-white">
        <div className="mx-auto max-w-2xl rounded-[2rem] border border-amber-400/20 bg-amber-500/10 p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-100/80">
            Activation link
          </p>
          <h1 className="mt-3 text-2xl font-semibold">This squad place is no longer pending</h1>
          <p className="mt-3 text-sm leading-6 text-amber-100/80">
            This can happen if your account has already been linked or the squad place has been changed by the organiser.
          </p>
          <Link
            href={`/player/team/${prospect?.teamId ?? ""}`}
            className="mt-5 inline-flex rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            Go to team area
          </Link>
        </div>
      </div>
    );
  }

  const normalizedProspectEmail = prospect.email?.trim().toLowerCase() ?? null;
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    const fullName = [prospect.firstName, prospect.lastName].filter(Boolean).join(" ").trim();

    return (
      <div className="min-h-screen bg-[#07130f] px-4 py-10 text-white">
        <div className="mx-auto max-w-3xl space-y-6">
          <section className="rounded-[2rem] border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Activate squad place
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
              {prospect.team.name}
            </h1>
            <p className="mt-3 text-sm leading-6 text-white/70">
              Sign in with the email address this invite was sent to and SIXFL will link your account to the squad.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {prospect.team.league?.name ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                  {prospect.team.league.name}
                  {prospect.team.league.season ? ` · ${prospect.team.league.season}` : ""}
                </span>
              ) : null}
              {prospect.team.league?.dayOfWeek ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                  {prospect.team.league.dayOfWeek}
                </span>
              ) : null}
              {prospect.team.league?.venueName ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                  {prospect.team.league.venueName}
                </span>
              ) : null}
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-black text-white/70">
                {getInitials(fullName || prospect.email || "Squad")}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {fullName || "Your squad place is ready"}
                </h2>
                <p className="mt-1 text-sm text-white/60">
                  Invite email: {normalizedProspectEmail ?? "No email saved"}
                </p>
              </div>
            </div>

            <Link
              href={buildLoginUrl({ token, email: normalizedProspectEmail })}
              className="mt-6 inline-flex rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              Sign in to activate
            </Link>
          </section>
        </div>
      </div>
    );
  }

  const sessionEmail = session.user.email.trim().toLowerCase();

  if (!normalizedProspectEmail || sessionEmail !== normalizedProspectEmail) {
    return (
      <div className="min-h-screen bg-[#07130f] px-4 py-10 text-white">
        <div className="mx-auto max-w-2xl rounded-[2rem] border border-red-400/20 bg-red-500/10 p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-red-200/80">
            Email mismatch
          </p>
          <h1 className="mt-3 text-2xl font-semibold">This invite is for a different email address</h1>
          <p className="mt-3 text-sm leading-6 text-red-100/80">
            This squad place is linked to {normalizedProspectEmail ?? "the saved prospect email"}. You are signed in as {sessionEmail}.
          </p>
          <p className="mt-3 text-sm leading-6 text-red-100/80">
            Sign out and sign back in using the invite email, or ask the organiser to update your prospect email.
          </p>
        </div>
      </div>
    );
  }

  const userId =
    (session.user as typeof session.user & { id?: string }).id ??
    (await prisma.user.findUnique({
      where: { email: sessionEmail },
      select: { id: true },
    }))?.id;

  if (!userId) {
    redirect(buildLoginUrl({ token, email: normalizedProspectEmail }));
  }

  await prisma.$transaction(async (tx) => {
    const existingMembership = await tx.teamMember.findUnique({
      where: {
        userId_teamId: {
          userId,
          teamId: prospect.teamId,
        },
      },
      select: { id: true },
    });

    if (!existingMembership) {
      await tx.teamMember.create({
        data: {
          userId,
          teamId: prospect.teamId,
          role: "PLAYER",
        },
      });
    }

    await tx.teamPlayerProspect.update({
      where: { id: prospect.id },
      data: {
        status: "ACTIVE_SQUAD",
        lastContactedAt: new Date(),
      },
    });
  });

  return (
    <div className="min-h-screen bg-[#07130f] px-4 py-10 text-white">
      <div className="mx-auto max-w-2xl rounded-[2rem] border border-emerald-400/20 bg-emerald-500/10 p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200/80">
          Squad activated
        </p>
        <h1 className="mt-3 text-2xl font-semibold">You’re now linked to {prospect.team.name}</h1>
        <p className="mt-3 text-sm leading-6 text-emerald-100/80">
          Your SIXFL account has been connected to this squad using {sessionEmail}.
        </p>
        <Link
          href={`/player/team/${prospect.teamId}`}
          className="mt-5 inline-flex rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
        >
          Go to team area
        </Link>
      </div>
    </div>
  );
}
