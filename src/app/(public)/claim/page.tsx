// ========================================
// File: src/app/(public)/claim/page.tsx
// ========================================

import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { TeamRole } from "@prisma/client";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";

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

    const code = String(formData.get("code") ?? "")
      .trim()
      .toUpperCase();

    if (!code) redirect("/claim?error=missing_code");

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user) redirect("/login");

    const team = await prisma.team.findUnique({
      where: { claimCode: code },
      select: { id: true, name: true },
    });

    if (!team) {
      redirect(`/claim?error=invalid&code=${encodeURIComponent(code)}`);
    }

    await prisma.teamMember.upsert({
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
    });

    redirect(`/captain/team/${team.id}?claimed=1`);
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Claim your team</h1>
        <p className="text-white/60">
          Enter your claim code to become the team captain.
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