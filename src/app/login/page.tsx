// ========================================
// File: src/app/login/page.tsx
// ========================================

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
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
          <input name="csrfToken" type="hidden" value="" />
          <input name="callbackUrl" type="hidden" value="/dashboard" />

          <input
            type="email"
            name="email"
            required
            placeholder="captain@email.com"
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-emerald-400"
          />

          <button
            type="submit"
            className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-black hover:bg-emerald-400"
          >
            Send magic link
          </button>
        </form>
      </div>
    </div>
  );
}