import { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  getOrCreateReferralCode,
  getTeamReferrals,
  referralStatus,
} from "@/lib/team-referrals";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Refer a Team | SIXFL Player App" };

function money(pence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(pence / 100);
}

export default async function PlayerTeamReferralsPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamid: string }>;
  searchParams?: Promise<{ previewMembershipId?: string }>;
}) {
  const { teamid } = await params;
  const sp = (await searchParams) ?? {};
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/player/team/${teamid}/referrals`)}`,
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email.trim().toLowerCase() },
    select: {
      id: true,
      role: true,
      teamMembers: {
        where: { teamId: teamid },
        select: { id: true, userId: true },
        take: 1,
      },
    },
  });

  if (!user) notFound();

  const previewMembershipId =
    user.role === UserRole.ADMIN ? sp.previewMembershipId?.trim() || null : null;
  const previewMembership = previewMembershipId
    ? await prisma.teamMember.findFirst({
        where: { id: previewMembershipId, teamId: teamid },
        select: { id: true, userId: true },
      })
    : null;

  if (previewMembershipId && !previewMembership) notFound();

  const membership = previewMembership ?? user.teamMembers[0] ?? null;
  if (!membership && user.role !== UserRole.ADMIN) notFound();

  const effectiveUserId = membership?.userId ?? user.id;
  const [code, referrals] = await Promise.all([
    getOrCreateReferralCode(effectiveUserId),
    getTeamReferrals(effectiveUserId),
  ]);
  const referralUrl = `https://www.sixfl.co.uk/register-interest?type=team&ref=${encodeURIComponent(code)}`;

  return (
    <main className="px-4 pb-28 pt-5 text-white">
      <div className="mx-auto w-full max-w-xl">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300/70">
            Player app
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">Refer a team</h1>
          <p className="mt-2 text-sm leading-6 text-white/45">
            Earn £75 when a new team joins SIXFL and completes three qualifying matches.
          </p>
        </div>

        <section className="mt-5 rounded-[1.5rem] border border-emerald-400/20 bg-emerald-500/[0.08] p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200/65">
            Your referral code
          </div>
          <div className="mt-2 rounded-xl border border-white/10 bg-black/20 px-4 py-3 font-mono text-lg font-black tracking-[0.18em]">
            {code}
          </div>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`Join SIXFL using my referral link: ${referralUrl}`)}`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex min-h-11 items-center justify-center rounded-xl bg-emerald-400 px-4 text-sm font-black text-black"
          >
            Share referral link
          </a>
        </section>

        <section className="mt-4 overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.04]">
          <div className="border-b border-white/[0.06] px-4 py-3">
            <h2 className="text-sm font-black">Your referrals</h2>
          </div>
          {referrals.length === 0 ? (
            <p className="px-4 py-6 text-sm leading-6 text-white/45">
              No referrals yet. Share your link and new registrations will appear here.
            </p>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {referrals.map((row) => {
                const status = referralStatus(row);
                const progress = Math.min(row.completedMatches, row.requiredMatches);
                const statusLabel =
                  status === "PAID"
                    ? `${money(row.rewardPence)} paid`
                    : status === "READY"
                      ? `${money(row.rewardPence)} ready`
                      : status === "INELIGIBLE"
                        ? "Not eligible"
                        : `${progress}/${row.requiredMatches} matches`;

                return (
                  <div key={row.id} className="px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-white">
                          {row.teamName ?? row.leadTeamName ?? "Referred team"}
                        </div>
                        <div className="mt-1 truncate text-xs text-white/35">
                          {row.leagueName ?? "Waiting to join a league"}
                        </div>
                      </div>
                      <span
                        className={[
                          "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black",
                          status === "PAID"
                            ? "bg-emerald-400 text-black"
                            : status === "READY"
                              ? "bg-sky-300 text-black"
                              : status === "INELIGIBLE"
                                ? "bg-red-400/20 text-red-100"
                                : "bg-amber-300 text-black",
                        ].join(" ")}
                      >
                        {statusLabel}
                      </span>
                    </div>
                    {status === "PENDING" ? (
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-emerald-400"
                          style={{ width: `${(progress / row.requiredMatches) * 100}%` }}
                        />
                      </div>
                    ) : null}
                    {status === "READY" ? (
                      <p className="mt-3 text-xs leading-5 text-white/50">
                        Your reward is ready. SIXFL will arrange payment with you.
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
