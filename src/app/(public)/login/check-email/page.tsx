// ========================================
// File: src/app/login/check-email/page.tsx
// ========================================

type PageProps = {
  searchParams: Promise<{
    email?: string;
    pendingCaptain?: string;
    teamName?: string;
  }>;
};

export default async function CheckEmailPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const email = params.email ?? "your email address";
  const pendingCaptain = params.pendingCaptain === "1";
  const teamName = params.teamName?.trim() || "your team";

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">Check your email</h1>

        <p className="mt-4 text-base text-white/70">
          We’ve sent your SIXFL sign-in link to:
        </p>

        <p className="mt-3 break-all text-lg font-medium text-emerald-300">
          {email}
        </p>

        <p className="mt-6 text-sm text-white/50">
          It should arrive in a moment. If you don’t see it, check your spam or
          junk folder.
        </p>

        {pendingCaptain ? (
          <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            You haven’t fully registered as captain for {teamName} yet. Open the
            link in your email first, then complete the team claim step.
          </div>
        ) : null}

        <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm leading-6 text-emerald-200">
          Open the email link on this device in the same normal browser you use
          for SIXFL, such as Chrome or Safari. If your email app opens its own
          mini-browser, choose <strong>Open in browser</strong>. This helps SIXFL
          keep you signed in for your next visit.
        </div>

        <div className="mt-6">
          <a
            href="/login"
            className="text-sm font-medium text-emerald-300 underline underline-offset-4 transition hover:text-emerald-200"
          >
            Use a different email
          </a>
        </div>
      </div>
    </div>
  );
}
