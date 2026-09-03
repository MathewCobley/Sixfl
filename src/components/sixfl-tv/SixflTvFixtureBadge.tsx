import Link from "next/link";

import { getFirstSixflTvUrl } from "@/lib/sixfl-tv/videos";

export default function SixflTvFixtureBadge({
  recorded,
  url,
}: {
  recorded: boolean;
  url?: string | null;
}) {
  const firstUrl = getFirstSixflTvUrl(url);
  if (!recorded && !firstUrl) return null;

  const className =
    "inline-flex items-center rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-fuchsia-100 transition hover:bg-fuchsia-500/20";
  const label = firstUrl ? "SIXFL TV ▶" : "SIXFL TV";

  return firstUrl ? (
    <Link
      href={firstUrl}
      target="_blank"
      rel="noreferrer"
      className={className}
      title="Watch this fixture on SIXFL TV"
    >
      {label}
    </Link>
  ) : (
    <span className={className} title="This fixture is being recorded for SIXFL TV">
      {label}
    </span>
  );
}
