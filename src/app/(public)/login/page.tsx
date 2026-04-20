// ========================================
// File: src/app/login/page.tsx
// ========================================

"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setNotice(null);

    const res = await fetch("/api/auth/check-email", {
      method: "POST",
      body: JSON.stringify({ email }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await res.json();

    if (!data.canLogin) {
      setLoading(false);
      setNotice("This email isn’t currently registered with SIXFL.");
      return;
    }

    const callbackUrl = data.pendingCaptain
      ? data.claimCode
        ? `/claim?code=${encodeURIComponent(data.claimCode)}`
        : "/claim"
      : "/dashboard";

    const result = await signIn("email", {
      email,
      callbackUrl,
      redirect: false,
    });

    if (result?.error) {
      setLoading(false);
      setNotice("We couldn’t send your sign-in link. Please try again.");
      return;
    }

    const nextUrl = new URL("/login/check-email", window.location.origin);
    nextUrl.searchParams.set("email", email);

    if (data.pendingCaptain) {
      nextUrl.searchParams.set("pendingCaptain", "1");

      if (data.teamName) {
        nextUrl.searchParams.set("teamName", data.teamName);
      }
    }

    window.location.href = nextUrl.toString();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl">
        <h1 className="text-xl font-semibold">Login</h1>

        <p className="mt-1 text-sm text-white/70">
          Enter your email to receive a SIXFL login link.
        </p>

        {notice && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            <p>{notice}</p>
            <p className="mt-2 text-amber-100/90">
              If you’d like to play, enter a team or referee, please{" "}
              <Link
                href="/register-interest"
                className="font-semibold text-emerald-300 underline underline-offset-4 transition hover:text-emerald-200"
              >
                register your interest here
              </Link>
              .
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="captain@email.com"
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-emerald-400"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-60"
          >
            {loading ? "Sending link..." : "Send magic link"}
          </button>
        </form>

        <p className="mt-4 text-xs text-white/50">
          Registered SIXFL users can log in here. Pending captains can also use
          their team email to get started and then claim their team.
        </p>
      </div>
    </div>
  );
}
