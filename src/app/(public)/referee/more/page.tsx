import Link from "next/link";

import RefereeAppShell from "@/components/referee/RefereeAppShell";
import { requireReferee } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const items = [
  {
    href: "/referee/match-rules",
    title: "Match Rules",
    description: "Playing rules and quick guidance for decisions on the pitch.",
  },
  {
    href: "/referee/league-rules",
    title: "League Rules",
    description: "Competition, conduct, payments and the rules that apply across SIXFL.",
  },
  {
    href: "/referee/agreement",
    title: "Referee Agreement",
    description: "The current agreement covering your role as a SIXFL referee.",
  },
];

export default async function RefereeMorePage() {
  await requireReferee();

  return (
    <RefereeAppShell active="more" title="More">
      <section className="space-y-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex min-h-20 items-center justify-between gap-4 rounded-[1.2rem] border border-white/10 bg-white/[0.035] p-4 active:bg-white/[0.07]"
          >
            <div className="min-w-0">
              <h1 className="text-sm font-black text-white">{item.title}</h1>
              <p className="mt-1 text-xs leading-5 text-white/50">{item.description}</p>
            </div>
            <span aria-hidden="true" className="shrink-0 text-lg text-white/35">›</span>
          </Link>
        ))}
      </section>
    </RefereeAppShell>
  );
}
