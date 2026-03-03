"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-xl font-semibold">Login</h1>
        <p className="text-sm text-white/70 mt-1">
          Enter your email to receive a login link.
        </p>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setStatus("Sending...");

            const res = await signIn("email", {
              email,
              callbackUrl: "/manager",
              redirect: false,
            });

            if (res?.error) setStatus(`Error: ${res.error}`);
            else setStatus("Check your inbox (and spam) for the magic link.");
          }}
          className="mt-6 space-y-3"
        >
          <input
            type="email"
            required
            placeholder="captain@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-emerald-400"
          />

          <button className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-black hover:bg-emerald-400">
            Send magic link
          </button>

          {status && (
            <div className="text-sm text-white/70">{status}</div>
          )}
        </form>
      </div>
    </div>
  );
}