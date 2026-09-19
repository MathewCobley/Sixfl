import Link from "next/link";

import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "More | SIXFL Admin",
};

const groups = [
  {
    title: "Operations",
    links: [
      { label: "Night Board", href: "/admin/night-board" },
      { label: "Matchweek reports", href: "/admin/matchweek-reports" },
      { label: "Results & disputes", href: "/admin/results" },
      { label: "Payments", href: "/admin/payments" },
      { label: "Referees", href: "/admin/referees" },
    ],
  },
  {
    title: "League management",
    links: [
      { label: "Leagues", href: "/admin/leagues" },
      { label: "Venues", href: "/admin/venues" },
      { label: "Leads", href: "/admin/leads" },
      { label: "Cups", href: "/admin/cups" },
      { label: "SIXFL TV", href: "/admin/sixfl-tv" },
      { label: "Social", href: "/admin/social" },
    ],
  },
  {
    title: "System",
    links: [
      { label: "Search", href: "/admin/search" },
      { label: "Users", href: "/admin/users" },
      { label: "Queue", href: "/admin/queue" },
      { label: "Templates", href: "/admin/templates" },
      { label: "PWA / phone preview", href: "/admin/pwa" },
      { label: "Public site", href: "/" },
    ],
  },
];

export default async function AdminMorePage() {
  await requireAdmin();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-8 pt-5 sm:px-6">
      <div className="mb-5">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300/70">
          Admin
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white">More</h1>
        <p className="mt-2 text-sm leading-6 text-white/50">
          The less-frequent admin tools live here so the main app navigation can stay simple.
        </p>
      </div>

      <div className="space-y-5">
        {groups.map((group) => (
          <section
            key={group.title}
            className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.025]"
          >
            <div className="border-b border-white/8 px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-white/35">
              {group.title}
            </div>

            <div className="divide-y divide-white/8">
              {group.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex min-h-14 items-center justify-between gap-4 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/[0.04]"
                >
                  <span>{link.label}</span>
                  <span aria-hidden="true" className="text-white/25">›</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
