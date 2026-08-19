// ========================================
// File: src/app/captain/team/[teamid]/player-payments/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";

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

  const missingEmailMembers = team.members.filter(
    (member) => !member.user.email?.trim(),
  );

  if (missingEmailMembers.length > 0) {
    return (
      <div className="space-y-6">
        <section className="rounded-3xl border border-amber-400/25 bg-amber-500/[0.08] p-6 sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200/80">
            Squad payments not ready
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">
            Add every squad member&apos;s email before using Squad payments
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-50/75 sm:text-base">
            SIXFL sends individual payment links by email. To stop payment requests being
            missed or set up against incomplete player records, every current squad member
            must have an email address saved before {team.name} can set up or update Squad
            payments.
          </p>

          <div className="mt-6 rounded-2xl border border-amber-300/20 bg-black/20 p-4">
            <div className="text-sm font-semibold text-white">
              {missingEmailMembers.length} squad member{missingEmailMembers.length === 1 ? " is" : "s are"} missing an email
            </div>
            <ul className="mt-3 space-y-2 text-sm text-amber-50/75">
              {missingEmailMembers.map((member) => (
                <li key={member.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                  <span>{member.user.name?.trim() || "Unnamed squad member"}</span>
                  <span className="text-xs uppercase tracking-wide text-amber-200/60">
                    {member.role.replaceAll("_", " ")}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/captain/team/${team.id}/captain-squad`}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-amber-300 px-5 text-sm font-semibold text-black transition hover:bg-amber-200"
            >
              Add missing emails
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
    );
  }

  return <PaymentPageServer {...props} />;
}
