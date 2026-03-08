// ========================================
// File: src/app/dashboard/page.tsx
// ========================================

import Link from "next/link";
import { auth } from "@/auth";
import SignOutButton from "./SignOutButton";

export default async function DashboardPage() {
  const session = await auth();

  if (!session) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-3 text-white/80">You’re not signed in.</p>
        <Link
          className="mt-4 inline-block rounded-md bg-emerald-500 px-4 py-2 font-medium text-black"
          href="/login"
        >
          Go to login
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Manager Dashboard</h1>
          <p className="mt-3 text-white/80">
            Signed in as{" "}
            <span className="text-white">{session.user?.email}</span>
          </p>
        </div>

        <SignOutButton />
      </div>

      <div className="mt-8 grid gap-4">
        <Link
          className="rounded-xl border border-white/10 bg-white/5 p-5 hover:bg-white/10"
          href="/leagues"
        >
          <div className="font-semibold">Leagues</div>
          <div className="text-sm text-white/70">
            View league tables & fixtures
          </div>
        </Link>

        <Link
          className="rounded-xl border border-white/10 bg-white/5 p-5 hover:bg-white/10"
          href="/venues"
        >
          <div className="font-semibold">Venues</div>
          <div className="text-sm text-white/70">Manage pitch locations</div>
        </Link>
      </div>
    </div>
  );
}