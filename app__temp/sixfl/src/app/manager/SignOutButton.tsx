"use client";
import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:text-white"
    >
      Sign out
    </button>
  );
}