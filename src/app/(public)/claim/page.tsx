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

function getClaimPath(code?: string | null) {
  const cleanCode = code?.trim();
  return cleanCode ? `/claim?code=${encodeURIComponent(cleanCode)}` : "/claim";
}

function getLoginPath(input: { code?: string | null; email?: string | null }) {
  const params = new URLSearchParams();
  params.set("callbackUrl", getClaimPath(input.code));

  const email = input.email?.trim();
  if (email) params.set("email", email);

  return `/login?${params.toString()}`;
}

async function getTeamByClaimCode(code: string) {
  return prisma.team.findFirst({
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
      captainUserId: true,
    },
  });
}

async function claimTeamForSession(input: { code: string; email: string }) {
  const email = input.email.toLowerCase().trim();
  const code = input.code.trim();

  if (!code) return { ok: false as const, error: "missing_code" };

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true },
  });

  if (!user) return { ok: false as const, error: "not_signed_in" };

  const team = await getTeamByClaimCode(code);

  if (!team) return { ok: false as const, error: "invalid" };

  const allowedEmails = getAllowedClaimEmails(team);
  if (allowedEmails.length > 0 && !allowedEmails.includes(email)) {
    return { ok: false as const, error: "wrong_email", code };
  }

  if (team.captainUserId && team.captainUserId !== user.id) {
    return { ok: false as const, error: "already_claimed", code };
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

  return { ok: true as const, teamId: team.id };
}

export default async function ClaimTeamPage({
  searchParams,
}: {
  searchParams?: Promise<{ code?: string; error?: string }>; 
}) {
  const sp = (await searchParams) ?? {};
  const codeFromUrl = (sp.code ?? "").trim();
  let error = sp.error;
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    const team = codeFromUrl ? await getTeamByClaimCode(codeFromUrl) : null;
    redirect(
      getLoginPath({
        code: codeFromUrl,
        email: team?.captainInviteSentTo ?? team?.contactEmail ?? team?.secondaryContactEmail ?? null,
      }),
    );
  }

  if (codeFromUrl && !error) {
    const result = await claimTeamForSession({
      code: codeFromUrl,
      email: session.user.email,
    });

    if (result.ok) {
      redirect(`/captain/team/${result.teamId}?claimed=1`);
    }

    error = result.error;
  }

  async function claimTeamAction(formData: FormData) {
    "use server";

    const session = await getServerSession(authOptions);
    const code = String(formData.get("code") ?? "").trim();

    if (!session?.user?.email) {
      redirect(getLoginPath({ code }));
    }

    const result = await claimTeamForSession({
      code,
      email: session.user.email,
    });

    if (!result.ok) {
      redirect(`/claim?error=${encodeURIComponent(result.error)}&code=${encodeURIComponent(code)}`);
    }

    redirect(`/captain/team/${result.teamId}?claimed=1`);
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
          {error === "already_claimed" && (
            <div className="text-red-300">
              This team has already been claimed by another captain account. Ask SIXFL admin to check the team access.
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
