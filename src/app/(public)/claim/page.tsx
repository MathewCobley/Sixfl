// ========================================
// File: src/app/(public)/claim/page.tsx
// ========================================

import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { TeamRole } from "@prisma/client";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";

function normaliseEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

function getAllowedClaimEmails(team: {
  contactEmail: string | null;
  secondaryContactEmail: string | null;
  captainInviteSentTo: string | null;
}) {
  return [
    normaliseEmail(team.contactEmail),
    normaliseEmail(team.secondaryContactEmail),
    normaliseEmail(team.captainInviteSentTo),
  ].filter((email): email is string => Boolean(email));
}

export default async function ClaimTeamPage({
  searchParams,
}: {
  searchParams?: Promise<{ code?: string; error?: string }>;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect("/login");
  }

  const sp = (await searchParams) ?? {};
  const codeFromUrl = (sp.code ?? "").trim();
  const error = sp.error;

  async function claimTeamAction(formData: FormData) {
    "use server";

    const session = await getServerSession(authOptions);
    if (!session?.user?.email) redirect("/login");

    const email = session.user.email.toLowerCase().trim();
    const code = String(formData.get("code") ?? "").trim();

    if (!code) redirect("/claim?error=missing_code");

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true },
    });

    if (!user) redirect("/login");

    const team = await prisma.team.findFirst({
      where: {
        claimCode: {
          equals: code,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        name: true,
        contactName: true,
        contactEmail: true,
        secondaryContactEmail: true,
        captainInviteSentTo: true,
      },
    });

    if (!team) {
      redirect(`/claim?error=invalid&code=${encodeURIComponent(code)}`);
    }

    const allowedEmails = getAllowedClaimEmails(team);
    if (allowedEmails.length > 0 && !allowedEmails.includes(email)) {
      redirect(`/claim?error=wrong_email&code=${encodeURIComponent(code)}`);
    }

    const captainName = team.contactName?.trim() || null;
    const userNameUpdate = captainName && !user.name?.trim()
      ? prisma.user.update({
          where: { id: user.id },
          data: { name: captainName },
        })
      : null;

    await prisma.$transaction([
      prisma.teamMember.upsert({
        where: {
          userId_teamId: {
            userId: user.id,
            teamId: team.id,
          },
        },
        update: { role: TeamRole.CAPTAIN },
        create: {
          userId: user.id,
          teamId: team.id,
          role: TeamRole.CAPTAIN,
        },
      }),
      prisma.team.update({
        where: { id: team.id },
        data: {
          captainUserId: user.id,
          captainLinkedAt: new Date(),
          captainLinkedSource: "CLAIM_LINK",
          captainClaimedAt: new Date(),
          captainClaimSource: "CLAIM_LINK",
        },
      }),
      ...(userNameUpdate ? [userNameUpdate] : []),
    ]);

    redirect(`/captain/team/${team.id}?claimed=1`);
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Claim your team</h1>
        <p className="text-white/60">
          Enter your claim code to activate captain access for your team.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-sm">
          {error === "missing_code" && (
            <div className="text-red-300">Please enter a claim code.</div>
          )}
          {error === "invalid" && (
            <div className="text-red-300">That claim code isn’t valid.</div>
          )}
          {error === "wrong_email" && (
            <div className="text-red-300">
              This claim link is for a different contact email. Please log in with the email address the team invite was sent to, or ask SIXFL to resend the captain invite.
            </div>
          )}
        </div>
      )}

      <form
        action={claimTeamAction}
        className="space-y-4 rounded-xl border border-white/10 p-6"
      >
        <div className="space-y-2">
          <label htmlFor="code" className="block text-sm text-white/80">
            Claim code
          </label>

          <input
            id="code"
            name="code"
            defaultValue={codeFromUrl}
            placeholder="e.g. H862NY"
            className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 font-mono uppercase tracking-wider outline-none placeholder:text-white/30 focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-md bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-500"
          >
            Claim team
          </button>

          <Link
            href="/dashboard"
            className="rounded-md border border-white/10 px-4 py-2 hover:bg-white/5"
          >
            Back
          </Link>
        </div>
      </form>

      <p className="text-sm text-white/50">
        If you don’t have a code, ask your league admin for a team claim link.
      </p>
    </div>
  );
}
