import Link from "next/link";

type LeagueQuickLinksProps = {
  slug: string;
  contextHref?: string;
  contextLabel?: string;
};

export default function LeagueQuickLinks({
  slug,
  contextHref,
  contextLabel,
}: LeagueQuickLinksProps) {
  const links = [
    ...(contextHref && contextLabel
      ? [{ href: contextHref, label: contextLabel }]
      : []),
    { href: `/leagues/${slug}#table`, label: "League table" },
    { href: `/leagues/${slug}/fixtures`, label: "Fixtures" },
    { href: `/leagues/${slug}/results`, label: "Results" },
    { href: `/leagues/${slug}/stats`, label: "Stats" },
  ];

  return (
    <nav
      aria-label="League navigation"
      className="border-b border-white/10 bg-[#06110d] text-white"
    >
      <div className="mx-auto flex max-w-[1400px] flex-wrap gap-2 px-4 py-3 sm:px-6 lg:px-10">
        {links.map((link) => (
          <Link
            key={`${link.href}-${link.label}`}
            href={link.href}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/75 transition hover:border-emerald-400/30 hover:bg-emerald-500/10 hover:text-emerald-100"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
