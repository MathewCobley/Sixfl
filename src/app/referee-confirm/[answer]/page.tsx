// ========================================
// File: src/app/referee-confirm/[answer]/page.tsx
// ========================================

import Link from "next/link";

import { recordRefereeNightConfirmationResponse } from "@/lib/referee-night-confirmation-response";
import { formatNightDate } from "@/lib/referee-nights";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ answer: string }>;
  searchParams?: Promise<{ token?: string }>;
};

function getAnswer(value: string) {
  const parsed = value.trim().toLowerCase();
  if (parsed === "yes") return "yes" as const;
  if (parsed === "no") return "no" as const;
  return null;
}

function StaleConfirmationLink() {
  return (
    <main className="min-h-screen bg-[#07130f] px-4 py-10 text-white">
      <div className="mx-auto max-w-2xl rounded-3xl border border-amber-300/30 bg-amber-400/[0.08] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-200/80">
          SIXFL referee confirmation
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
          This confirmation link is no longer current
        </h1>
        <p className="mt-4 text-sm leading-6 text-white/70">
          The referee night may have been changed since this message was sent, so we have not recorded a response from this old link.
        </p>
        <p className="mt-3 text-sm leading-6 text-white/60">
          Open your referee dashboard to see the latest date, venue and fixtures, then confirm the current night there.
        </p>
        <Link
          href="/referee"
          className="mt-6 inline-flex rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-emerald-300"
        >
          Open my referee dashboard
        </Link>
      </div>
    </main>
  );
}

export default async function RefereeNightConfirmationPage({ params, searchParams }: PageProps) {
  const { answer: rawAnswer } = await params;
  const sp = (await searchParams) ?? {};
  const answer = getAnswer(rawAnswer);
  const token = sp.token?.trim();

  if (!answer || !token) {
    return <StaleConfirmationLink />;
  }

  const saved = await recordRefereeNightConfirmationResponse({ token, answer });
  if (!saved) {
    return <StaleConfirmationLink />;
  }

  const confirmed = answer === "yes";

  return (
    <main className="min-h-screen bg-[#07130f] px-4 py-10 text-white">
      <div className="mx-auto max-w-2xl rounded-3xl border border-emerald-400/20 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
          SIXFL referee confirmation
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
          {confirmed ? "Thanks — your night is confirmed" : "Thanks — we’ll sort cover"}
        </h1>
        <p className="mt-4 text-sm leading-6 text-white/70">
          {confirmed
            ? `We’ve recorded that you can referee on ${formatNightDate(saved.nightDate)} for ${saved.leagueName}.`
            : `We’ve recorded that you cannot make ${formatNightDate(saved.nightDate)} for ${saved.leagueName}. SIXFL will arrange cover.`}
        </p>
        <p className="mt-3 text-sm leading-6 text-white/55">
          You can always check or update your current availability from the referee dashboard.
        </p>
        <Link
          href="/referee"
          className="mt-6 inline-flex rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-emerald-300"
        >
          Open my referee dashboard
        </Link>
      </div>
    </main>
  );
}
