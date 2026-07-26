"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type AdvertMeta = {
  leagueName: string;
  leagueSlug: string;
  hasVideo: boolean;
  uploadedAt: string | null;
};

function getLeagueSlug(pathname: string) {
  const match = /^\/leagues\/([^/]+)\/?$/.exec(pathname);
  if (!match?.[1]) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export default function PublicLeagueAdvertVideo() {
  const pathname = usePathname();
  const slug = useMemo(() => getLeagueSlug(pathname), [pathname]);
  const [meta, setMeta] = useState<AdvertMeta | null>(null);

  useEffect(() => {
    setMeta(null);
    if (!slug) return;

    const controller = new AbortController();

    void fetch(
      `/api/public/leagues/${encodeURIComponent(slug)}/advert-video/meta`,
      {
        cache: "no-store",
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as AdvertMeta;
      })
      .then((payload) => {
        if (payload?.hasVideo) setMeta(payload);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          console.error("League advert metadata could not be loaded", error);
        }
      });

    return () => controller.abort();
  }, [slug]);

  if (!slug || !meta?.hasVideo) return null;

  return (
    <section className="bg-black px-4 pb-16 pt-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px] overflow-hidden rounded-[2rem] border border-emerald-400/20 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.42)] sm:p-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              SIXFL league advert
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
              Watch {meta.leagueName}
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-white/55">
            See what the league is about, then register your team or player interest
            through the league page above.
          </p>
        </div>

        <div className="overflow-hidden rounded-3xl border border-white/10 bg-black shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          <video
            src={`/api/public/leagues/${encodeURIComponent(meta.leagueSlug)}/advert-video`}
            controls
            playsInline
            preload="metadata"
            className="max-h-[820px] w-full bg-black object-contain"
          />
        </div>
      </div>
    </section>
  );
}
