import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import TeamBadgeUploader from "@/components/admin/teams/TeamBadgeUploader";

export const dynamic = "force-dynamic";

export default async function TeamBadgePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const team = await prisma.team.findUnique({ where: { id }, select: { id: true, name: true, logoUrl: true } });
  if (!team) notFound();
  return (
    <section className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-8">
      <Link href={`/admin/teams/${team.id}`} className="text-sm font-medium text-emerald-300 hover:text-emerald-200">
        Back to {team.name}
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-white">Team badge</h1>
      <p className="mt-2 text-sm leading-6 text-white/60">
        Choose an image, check the preview and save. No filenames, image links or GitHub changes needed.
        Your other team details are not changed here.
      </p>
      <TeamBadgeUploader key={team.id} teamId={team.id} teamName={team.name} initialLogoUrl={team.logoUrl} />
    </section>
  );
}
