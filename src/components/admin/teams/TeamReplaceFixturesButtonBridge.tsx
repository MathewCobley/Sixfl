// ========================================
// File: src/components/admin/teams/TeamReplaceFixturesButtonBridge.tsx
// ========================================

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function getTeamIdFromTeamAdminPath(pathname: string) {
  const match = pathname.match(/^\/admin\/teams\/([^/]+)\/?$/);
  return match?.[1] ?? null;
}

export default function TeamReplaceFixturesButtonBridge() {
  const pathname = usePathname();
  const teamId = getTeamIdFromTeamAdminPath(pathname);

  if (!teamId) return null;

  return (
    <Link
      href={`/admin/fixtures/replace-team?fromTeamId=${encodeURIComponent(teamId)}`}
      className="fixed bottom-6 right-6 z-50 hidden rounded-2xl border border-amber-400/30 bg-amber-500 px-5 py-3 text-sm font-bold text-black shadow-[0_18px_45px_rgba(0,0,0,0.35)] transition hover:bg-amber-400 xl:inline-flex"
    >
      Replace this team in fixtures
    </Link>
  );
}
