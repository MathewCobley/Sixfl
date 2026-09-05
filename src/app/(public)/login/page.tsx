// ========================================
// File: src/app/login/page.tsx
// ========================================

"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { loginErrorNotice, type LoginNotice } from "@/lib/auth/login-notice";

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
  const [notice, setNotice] = useState<LoginNotice | null>(null);

  const callbackUrlFromQuery = useMemo(() => {
    const value = searchParams.get("callbackUrl");
    return isSafeCallbackUrl(value) ? value! : "";
  }, [searchParams]);
  const signedInDestination = callbackUrlFromQuery || "/dashboard";

  useEffect(() => {
    const emailFromQuery = searchParams.get("email")?.trim() ?? "";
    if (emailFromQuery) setEmail(emailFromQuery);
    const error = searchParams.get("error");
    if (error) setNotice(loginErrorNotice(error));
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setNotice(null);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const res = await fetch("/api/auth/check-email", {
        method: "POST",
        body: JSON.stringify({ email: normalizedEmail }),
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Email eligibility check failed.");
      const data = await res.json();

      if (data.canLogin === false) {
        setNotice({
          message: "This email isn’t currently registered with SIXFL.",
          showRegistration: true,
        });
        return;
      }
      if (data.canLogin !== true) throw new Error("Invalid email eligibility response.");

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
        email: normalizedEmail,
        callbackUrl,
        redirect: false,
      });
      if (!result || result.error || !result.ok) {
        setNotice(loginErrorNotice(result?.error));
        return;
      }
      // NextAuth's CSRF rejection can return a 200 URL with ?csrf=true,
      // rather than result.error. Do not report that as a successful send.
      if (result.url && new URL(result.url, window.location.origin).searchParams.has("csrf")) {
        setNotice(loginErrorNotice("CSRF"));
        return;
      }

      const nextUrl = new URL("/login/check-email", window.location.origin);
      nextUrl.searchParams.set("email", normalizedEmail);
      if (data.pendingCaptain) nextUrl.searchParams.set("pendingCaptain", "1");
      if (data.pendingSquadActivation) nextUrl.searchParams.set("pendingSquadActivation", "1");
      if ((data.pendingCaptain || data.pendingSquadActivation) && data.teamName) {
        nextUrl.searchParams.set("teamName", data.teamName);
      }
      if (data.canChooseLoginArea) nextUrl.searchParams.set("choose", "1");
      window.location.href = nextUrl.toString();
    } catch {
      setNotice(loginErrorNotice(null));
    } finally {
      setLoading(false);
    }
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
          <div role="alert" className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            <p>{notice.message}</p>
            {notice.showRegistration && (
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
            )}
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
