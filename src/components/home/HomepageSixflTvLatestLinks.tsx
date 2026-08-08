"use client";

import { useEffect, useState } from "react";

type LatestTvItem = {
  id: string;
  fixtureId: string;
  matchup: string;
  kickoffAt: string;
  kind: "Highlights" | "Full match" | "Clip";
  href: string;
};

type LatestTvResponse = {
  items?: LatestTvItem[];
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

export default function HomepageSixflTvLatestLinks() {
  const [items, setItems] = useState<LatestTvItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/public/sixfl-tv/latest", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: LatestTvResponse | null) => {
        setItems(payload?.items ?? []);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Could not load latest SIXFL TV links", error);
      })
      .finally(() => setLoaded(true));

    return () => controller.abort();
  }, []);

  if (!loaded || items.length === 0) return null;

  return (
    <div className="mt-7 border-t border-white/10 pt-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-fuchsia-200/70">
            Latest on SIXFL TV
          </div>
          <div className="mt-1 text-sm text-white/50">
            Highlights and recorded matches already uploaded.
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <a
            key={item.id}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-2xl border border-white/10 bg-black/30 p-3.5 transition hover:border-fuchsia-300/30 hover:bg-white/[0.06]"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="rounded-full border border-fuchsia-300/20 bg-fuchsia-400/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.15em] text-fuchsia-100">
                {item.kind}
              </span>
              <span className="text-[10px] font-semibold text-white/35">
                {formatDate(item.kickoffAt)} ↗
              </span>
            </div>
            <div className="mt-2 line-clamp-2 text-sm font-bold leading-5 text-white/80 transition group-hover:text-white">
              {item.matchup}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
