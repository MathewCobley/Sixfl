// ========================================
// File: src/app/auth/verify-request/page.tsx
// ========================================

type PageProps = {
  searchParams: Promise<{
    email?: string;
  }>;
};

export default async function VerifyRequestPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const email = params.email ?? "your email address";

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 text-center shadow-2xl">
        <h1 className="text-2xl font-semibold">Check your email</h1>

        <p className="mt-3 text-sm text-white/70">
          A sign-in link has been sent to:
        </p>

        <p className="mt-2 break-all font-medium text-emerald-300">
          {email}
        </p>

        <p className="mt-4 text-xs text-white/50">
          If you don’t see it, check your spam folder.
        </p>
      </div>
    </div>
  );
}