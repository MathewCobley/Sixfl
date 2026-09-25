// ========================================
// File: src/app/captain/team/[teamid]/player-payments/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";

import CaptainPwaModeOnly from "@/components/captain/CaptainPwaModeOnly";

import { getTeamMemberSquadStatusMap } from "@/lib/managed-squad/squadStatus";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import PaymentPageServer from "./PaymentPageServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Squad Payments | SIXFL",
};

type Props = {
  params: Promise<{ teamid: string }>;
  searchParams?: Promise<{
    fixtureId?: string;
    saved?: string;
    error?: string;
    emailsQueued?: string;
    emailsSkipped?: string;
  }>;
};

export default async function SquadPaymentsPage(props: Props) {
  const { teamid } = await props.params;
  await requireCaptain(teamid);

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      name: true,
      members: {
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          role: true,
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!team) notFound();

  const squadStatusByMemberId = await getTeamMemberSquadStatusMap(teamid);
  const activeMembers = team.members.filter(
    (member) => squadStatusByMemberId.get(member.id)?.squadStatus !== "INACTIVE",
  );
  const inactiveMembers = team.members.filter(
    (member) => squadStatusByMemberId.get(member.id)?.squadStatus === "INACTIVE",
  );
  const missingEmailMembers = activeMembers.filter(
    (member) => !member.user.email?.trim(),
  );

  if (missingEmailMembers.length > 0) {
    return (
      <>
        <CaptainPwaModeOnly mode="app">
          <section className="captain-app-payment-alert overflow-hidden rounded-[1.25rem] border border-amber-400/25 bg-amber-500/[0.07]">
            <div className="p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-200/70">
                    Action needed
                  </p>
                  <h1 className="mt-1 text-[15px] font-black leading-5 text-white">
                    Payment links need player emails
                  </h1>
                </div>
                <span className="shrink-0 rounded-full border border-amber-300/20 bg-black/20 px-2.5 py-1 text-[10px] font-black text-amber-100">
                  {missingEmailMembers.length} missing
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-white/55">
                Add a real email address to each active player before creating squad payment links.
              </p>
            </div>

            <div className="divide-y divide-white/[0.07] border-t border-white/[0.07] bg-black/15">
              {missingEmailMembers.slice(0, 4).map((member) => (
                <Link
                  key={member.id}
                  href={`/captain/team/${team.id}/captain-squad/${member.id}/edit`}
                  className="flex min-h-11 items-center justify-between gap-3 px-3.5 py-2.5"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-black text-white">
                      {member.user.name?.trim() || "Unnamed squad member"}
                    </span>
                    <span className="mt-0.5 block text-[9px] uppercase tracking-[0.1em] text-white/30">
                      {member.role.replaceAll("_", " ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-[10px] font-bold text-amber-200">Fix →</span>
                </Link>
              ))}
              {missingEmailMembers.length > 4 ? (
                <div className="px-3.5 py-2 text-[10px] text-white/35">
                  +{missingEmailMembers.length - 4} more player{missingEmailMembers.length - 4 === 1 ? "" : "s"}
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-white/[0.07] p-3">
              <Link
                href={`/captain/team/${team.id}/captain-squad`}
                className="flex min-h-11 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-300 px-3 text-xs font-black text-black"
              >
                Fix squad details
              </Link>
              <Link
                href={`/captain/team/${team.id}/payments`}
                className="flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-3 text-xs font-bold text-white/70"
              >
                Team payments
              </Link>
            </div>
          </section>
        </CaptainPwaModeOnly>

        <CaptainPwaModeOnly mode="web">
          <div className="space-y-6">
            <section className="rounded-3xl border border-amber-400/25 bg-amber-500/[0.08] p-6 sm:p-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200/80">
                Squad payments not ready
              </p>
              <h1 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">
                Add an email for every active squad member before using Squad payments
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-50/75 sm:text-base">
                SIXFL sends individual payment links by email. Every player who is still part of
                the current squad must therefore have an email address saved before {team.name}{" "}
                can set up or update Squad payments.
              </p>

              <div className="mt-5 rounded-2xl border border-sky-300/20 bg-sky-500/10 p-4 text-sm leading-6 text-sky-50/80">
                <span className="font-semibold text-white">Historic player who no longer plays?</span>{" "}
                Do not add a made-up email address. Open that player and mark them
                <span className="font-semibold text-white"> Inactive</span>. Their historic matches,
                statistics and payments stay on SIXFL, but they will no longer block Squad payments.
              </div>

              <div className="mt-6 rounded-2xl border border-amber-300/20 bg-black/20 p-4">
                <div className="text-sm font-semibold text-white">
                  {missingEmailMembers.length} active squad member{missingEmailMembers.length === 1 ? " is" : "s are"} missing an email
                </div>
                <ul className="mt-3 space-y-2 text-sm text-amber-50/75">
                  {missingEmailMembers.map((member) => (
                    <li key={member.id} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <span>{member.user.name?.trim() || "Unnamed squad member"}</span>
                        <span className="ml-2 text-xs uppercase tracking-wide text-amber-200/60">
                          {member.role.replaceAll("_", " ")}
                        </span>
                      </div>
                      <a
                        href={`/captain/team/${team.id}/captain-squad/${member.id}/edit`}
                        className="inline-flex min-h-9 items-center justify-center rounded-full border border-white/10 bg-black/20 px-4 text-xs font-semibold text-white/80 transition hover:bg-white/[0.06] hover:text-white"
                      >
                        Add email or mark inactive
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              {inactiveMembers.length > 0 ? (
                <p className="mt-4 text-xs leading-5 text-white/45">
                  {inactiveMembers.length} historic/inactive player{inactiveMembers.length === 1 ? " is" : "s are"} already excluded from the current Squad payments email check.
                </p>
              ) : null}

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={`/captain/team/${team.id}/captain-squad`}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-amber-300 px-5 text-sm font-semibold text-black transition hover:bg-amber-200"
                >
                  Check squad details
                </Link>
                <Link
                  href={`/captain/team/${team.id}`}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/20 px-5 text-sm font-semibold text-white/80 transition hover:bg-white/[0.06] hover:text-white"
                >
                  Back to captain hub
                </Link>
              </div>
            </section>
          </div>
        </CaptainPwaModeOnly>
      </>
    );
  }

  return <PaymentPageServer {...props} />;
}
