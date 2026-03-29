"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 transition"
    >
      Sign out
    </button>
  );
}