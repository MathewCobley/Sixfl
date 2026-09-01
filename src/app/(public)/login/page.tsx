// ========================================
// File: src/app/login/page.tsx
// ========================================

"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";

function isSafeCallbackUrl(value: string | null) {
  if (!value) return false;
  return value.startsWith("/") && !value.startsWith("//");
}

function LoginFallback({ message = "Checking your existing sign-in..." }: { message?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl">
        <h1 className="text-xl font-semibold">Login</h1>
        <p className="mt-2 text-sm text-white/60">{message}</p>
      </div>
    </div>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const { status } = useSession();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const callbackUrlFromQuery = useMemo(() => {
    const value = searchParams.get("callbackUrl");
    return isSafeCallbackUrl(value) ? value! : "";
  }, [searchParams]);
  const signedInDestination = callbackUrlFromQuery || "/dashboard";

  useEffect(() => {
    const emailFromQuery = searchParams.get("email")?.trim() ?? "";

    if (emailFromQuery) {
      setEmail(emailFromQuery);
    }
  }, [searchParams]);

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

    const callbackUrl = callbackUrlFromQuery
      ? callbackUrlFromQuery
      : data.pendingCaptain
        ? data.claimCode
          ? `/claim?code=${encodeURIComponent(data.claimCode)}`
          : "/claim"
        : data.canChooseLoginArea
          ? "/dashboard"
          : data.isReferee
            ? "/referee"
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

    if (data.pendingSquadActivation) {
      nextUrl.searchParams.set("pendingSquadActivation", "1");

      if (data.teamName) {
        nextUrl.searchParams.set("teamName", data.teamName);
      }
    }

    if (data.canChooseLoginArea) {
      nextUrl.searchParams.set("choose", "1");
    }

    window.location.href = nextUrl.toString();
  }

  if (status === "loading") {
    return <LoginFallback />;
  }

  if (status === "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
        <div className="w-full max-w-md rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-6 shadow-2xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-200/70">
            Existing sign-in found
          </p>
          <h1 className="mt-3 text-2xl font-semibold">You’re already signed in</h1>
          <p className="mt-3 text-sm leading-6 text-emerald-50/75">
            This browser already has a valid SIXFL session. You do not need another email link.
          </p>

          <Link
            href={signedInDestination}
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-emerald-400 px-4 py-3 font-bold text-black transition hover:bg-emerald-300"
          >
            Open my SIXFL account
          </Link>

          <button
            type="button"
            onClick={() => void signOut({ callbackUrl: "/login" })}
            className="mt-3 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-white/70 transition hover:border-white/20 hover:bg-black/30 hover:text-white"
          >
            Sign out and use a different email
          </button>
        </div>
      </div>
    );
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
            placeholder="player@email.com"
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
          Registered SIXFL users, referees, pending captains and invited squad players can log in here using the email address connected to their invite.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback message="Loading login..." />}>
      <LoginForm />
    </Suspense>
  );
}
