// ========================================
// File: src/app/register-interest/already-registered/page.tsx
// ========================================

import Link from "next/link";

export const metadata = {
  title: "Already linked to a squad | SIXFL",
};

type PageProps = {
  searchParams?: Promise<{
    area?: string;
    night?: string;
  }>;
};

function buildPlayerRegisterHref(input: { area?: string; night?: string }) {
  const searchParams = new URLSearchParams();
  searchParams.set("type", "player");

  if (input.area?.trim()) searchParams.set("area", input.area.trim());
  if (input.night?.trim()) searchParams.set("night", input.night.trim());

  return `/register-interest?${searchParams.toString()}`;
}

export default async function AlreadyRegisteredPlayerPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  const tryAgainHref = buildPlayerRegisterHref({ area: sp.area, night: sp.night });

  return (
    <main className="min-h-screen bg-black px-4 py-10 text-white">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm text-white/60 transition hover:text-white">
          ← Back to home
        </Link>

        <section className="mt-6 overflow-hidden rounded-3xl border border-emerald-400/20 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_38%),rgba(255,255,255,0.05)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-8">
          <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300">
            SIXFL player registration
          </div>

          <h1 className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">
            This email already looks linked to a SIXFL squad
          </h1>

          <div className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-black/25 p-5 text-sm leading-7 text-white/75">
            <p>
              You do not need to complete the player interest form again if you have already been added to a squad or have received a SIXFL squad invite.
            </p>
            <p>
              Please use the squad invite link you were sent, or sign in with the same email address to open your SIXFL player area.
            </p>
          </div>

          <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-5 text-sm leading-7 text-amber-100/85">
            If this is a different person using the same email address, or you are trying to join a different team, please contact SIXFL so we can link you correctly rather than creating a duplicate record.
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login?callbackUrl=/player"
              className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold tracking-wide text-black transition hover:scale-[1.02] hover:bg-emerald-400"
            >
              SIGN IN WITH THIS EMAIL
            </Link>

            <a
              href="mailto:hello@sixfl.co.uk?subject=SIXFL%20player%20record%20help"
              className="inline-flex h-12 items-center justify-center rounded-full border border-sky-400/20 bg-sky-500/10 px-6 text-sm font-extrabold tracking-wide text-sky-100 transition hover:bg-sky-500/15"
            >
              CONTACT SIXFL
            </a>

            <Link
              href={tryAgainHref}
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 text-sm font-extrabold tracking-wide text-white transition hover:bg-white/10"
            >
              USE A DIFFERENT EMAIL
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
