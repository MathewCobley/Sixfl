import Link from "next/link";
import {
  BanknotesIcon,
  CalendarDaysIcon,
  ChartBarSquareIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";

type PageProps = {
  params: Promise<{ teamid: string }>;
  searchParams?: Promise<{ previewMembershipId?: string }>;
};

function withPreview(href: string, previewMembershipId: string | null) {
  if (!previewMembershipId) return href;
  const [path, hash = ""] = href.split("#");
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}previewMembershipId=${encodeURIComponent(previewMembershipId)}${hash ? `#${hash}` : ""}`;
}

export default async function PlayerMorePage({ params, searchParams }: PageProps) {
  const { teamid } = await params;
  const sp = (await searchParams) ?? {};
  const previewMembershipId = sp.previewMembershipId?.trim() || null;

  const rows = [
    {
      href: withPreview(`/player/team/${teamid}/ledger`, previewMembershipId),
      label: "Payments",
      description: "Match fees, balance and payment history",
      icon: BanknotesIcon,
    },
    {
      href: withPreview(`/player/team/${teamid}/stats`, previewMembershipId),
      label: "My stats",
      description: "Appearances, goals and player performance",
      icon: ChartBarSquareIcon,
    },
    {
      href: withPreview(
        `/player/team/${teamid}/availability#recent-results`,
        previewMembershipId,
      ),
      label: "Recent results",
      description: "Your latest SIXFL results inside the app",
      icon: CalendarDaysIcon,
    },
  ];

  return (
    <main className="min-h-screen bg-[#07130f] px-4 pb-28 pt-5 text-white">
      <div className="mx-auto w-full max-w-xl">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300/70">
            Player app
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">More</h1>
          <p className="mt-2 text-sm leading-6 text-white/45">
            Everything here stays inside the SIXFL player app.
          </p>
        </div>

        <section className="mt-5 overflow-hidden rounded-[1.6rem] bg-white/[0.045]">
          {rows.map((row, index) => {
            const Icon = row.icon;
            return (
              <Link
                key={row.href}
                href={row.href}
                className={[
                  "flex min-h-[4.6rem] items-center gap-4 px-4 py-3 active:bg-white/[0.05]",
                  index < rows.length - 1 ? "border-b border-white/[0.06]" : "",
                ].join(" ")}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/[0.055] text-emerald-200">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-white">{row.label}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-white/40">
                    {row.description}
                  </span>
                </span>
                <ChevronRightIcon className="h-5 w-5 shrink-0 text-white/25" />
              </Link>
            );
          })}
        </section>

        <div className="mt-5">
          <Link
            href="/api/auth/signout"
            className="flex min-h-12 items-center justify-center rounded-2xl border border-white/10 px-4 text-sm font-semibold text-white/45"
          >
            Sign out
          </Link>
        </div>
      </div>
    </main>
  );
}
