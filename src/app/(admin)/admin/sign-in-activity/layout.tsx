import Link from "next/link";

export default function SignInActivityLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] p-2">
        <Link
          href="/admin/sign-in-activity"
          className="rounded-xl px-3 py-2 text-xs font-semibold text-white/65 transition hover:bg-white/10 hover:text-white"
        >
          Magic-link activity
        </Link>
        <Link
          href="/admin/sign-in-activity/returning"
          className="rounded-xl border border-sky-400/20 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-100 transition hover:bg-sky-500/15"
        >
          Session return diagnosis
        </Link>
        <span className="ml-auto px-2 text-xs text-white/35">
          Compare repeat magic-link logins with successful returns on an existing session.
        </span>
      </div>
      {children}
    </div>
  );
}
