import Link from "next/link";
import { requireAdmin } from "@/lib/requireAdmin";
import { getTeamLogoExportChoices } from "@/lib/exports/team-logos";
import TeamLogoExportSelector from "@/components/admin/teams/TeamLogoExportSelector";

export const dynamic = "force-dynamic";
export const metadata = { title: "Download team logos | SIXFL" };

export default async function TeamLogosPage() {
  await requireAdmin();
  const teams = await getTeamLogoExportChoices();
  return <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-3xl space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Team artwork</p>
        <h1 className="text-3xl font-semibold text-white">Download team logos</h1>
        <p className="text-sm leading-6 text-white/65">Tick the teams you need, then download one ZIP. Logos are named after the teams and grouped into league folders, with an export report listing anything missing.</p>
        <p className="text-xs leading-5 text-white/50">Uses each team's current assigned artwork in its stored format and resolution, without screenshots or thumbnails. Uploaded badges use the full-size stored version. This does not email anyone or alter team records.</p>
      </div>
      <Link href="/admin/teams" className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5">Back to teams</Link>
    </div>
    <TeamLogoExportSelector teams={teams} />
  </div>;
}
