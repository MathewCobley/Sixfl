// ========================================
// File: src/app/login/page.tsx
// ========================================

"use client";

import { useEffect, useState } from "react";

export default function LoginPage() {
  const [csrfToken, setCsrfToken] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCsrf() {
      try {
        const res = await fetch("/api/auth/csrf");
        const data = await res.json();
        setCsrfToken(data.csrfToken ?? "");
      } catch (error) {
        console.error("Failed to load CSRF token", error);
      } finally {
        setLoading(false);
      }
    }

    loadCsrf();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-xl font-semibold">Login</h1>
        <p className="mt-1 text-sm text-white/70">
          Enter your email to receive a login link.
        </p>

        <form
          action="/api/auth/signin/email"
          method="post"
          className="mt-6 space-y-3"
        >
          <input type="hidden" name="csrfToken" value={csrfToken} />
          <input type="hidden" name="callbackUrl" value="/dashboard" />

          <input
            type="email"
            name="email"
            required
            placeholder="captain@email.com"
            disabled={loading || !csrfToken}
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          />

          <button
            type="submit"
            disabled={loading || !csrfToken}
            className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Loading..." : "Send magic link"}
          </button>
        </form>
      </div>
    </div>
  );
}