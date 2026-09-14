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
  description: string;
}> = [
  {
    key: "overview",
    href: "/referee",
    label: "Overview",
    description: "Nights, fees and cashup",
  },
  {
    key: "availability",
    href: "/referee/availability",
    label: "Availability",
    description: "Mark dates you can ref",
  },
  {
    key: "match-rules",
    href: "/referee/match-rules",
    label: "Match rules",
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
  // in that case resolve preview context on the server rather than scanning or
  // rewriting links in the browser after render.
  if (effectivePreviewRefereeId === undefined) {
    const { user, isAdminPreview } = await requireReferee();
    effectivePreviewRefereeId = isAdminPreview ? user.id : null;
  }

  return (
    <nav className="grid gap-3 sm:grid-cols-3">
      {tabs.map((tab) => {
        const isActive = active === tab.key;
        const href = withPreviewRoute(tab.href, effectivePreviewRefereeId);

        return (
          <Link
            key={tab.key}
            href={href}
            className={[
              "rounded-3xl border p-4 transition",
              isActive
                ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-50"
                : "border-white/10 bg-white/[0.035] text-white/68 hover:border-white/20 hover:bg-white/[0.06] hover:text-white",
            ].join(" ")}
          >
            <div className="text-sm font-semibold">{tab.label}</div>
            <div className="mt-1 text-xs leading-5 text-white/45">{tab.description}</div>
          </Link>
        );
      })}
    </nav>
  );
}
