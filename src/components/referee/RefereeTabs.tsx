// ========================================
// File: src/components/referee/RefereeTabs.tsx
// ========================================

import Link from "next/link";

import { requireReferee } from "@/lib/admin";

type RefereeTabKey = "overview" | "availability" | "match-rules";

type Props = {
  active: RefereeTabKey;
  previewRefereeId?: string | null;
};

const tabs: Array<{
  key: RefereeTabKey;
  href: string;
  label: string;
  mobileLabel: string;
  description: string;
}> = [
  {
    key: "overview",
    href: "/referee",
    label: "Overview",
    mobileLabel: "Overview",
    description: "Nights, fees and cashup",
  },
  {
    key: "availability",
    href: "/referee/availability",
    label: "Availability",
    mobileLabel: "Availability",
    description: "Mark dates you can ref",
  },
  {
    key: "match-rules",
    href: "/referee/match-rules",
    label: "Match rules",
    mobileLabel: "Rules",
    description: "How SIXFL games run",
  },
];

function withPreviewRoute(href: string, previewRefereeId?: string | null) {
  if (!previewRefereeId) return href;

  return `/admin/referees/${encodeURIComponent(previewRefereeId)}/referee-preview?to=${encodeURIComponent(href)}`;
}

export default async function RefereeTabs({ active, previewRefereeId }: Props) {
  let effectivePreviewRefereeId = previewRefereeId;

  // Overview already has the preview id to hand. Other referee pages can omit it;
  // in that case resolve preview context entirely on the server rather than DOM
  // scanning or rewriting links in the browser after render.
  if (effectivePreviewRefereeId === undefined) {
    const { user, isAdminPreview } = await requireReferee();
    effectivePreviewRefereeId = isAdminPreview ? user.id : null;
  }

  return (
    <nav className="grid grid-cols-3 gap-2 sm:gap-3">
      {tabs.map((tab) => {
        const isActive = active === tab.key;
        const href = withPreviewRoute(tab.href, effectivePreviewRefereeId);

        return (
          <Link
            key={tab.key}
            href={href}
            className={[
              "flex min-h-11 items-center justify-center rounded-xl border px-2.5 py-2.5 text-center transition sm:block sm:min-h-0 sm:rounded-3xl sm:p-4 sm:text-left",
              isActive
                ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-50"
                : "border-white/10 bg-white/[0.035] text-white/68 hover:border-white/20 hover:bg-white/[0.06] hover:text-white",
            ].join(" ")}
          >
            <div className="text-xs font-semibold sm:text-sm">
              <span className="sm:hidden">{tab.mobileLabel}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </div>
            <div className="mt-1 hidden text-xs leading-5 text-white/45 sm:block">
              {tab.description}
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
