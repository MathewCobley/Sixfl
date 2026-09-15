import FreeKitOfferControl from "@/components/admin/teams/FreeKitOfferControl";
import TeamKitColourPickerClient from "@/components/admin/teams/TeamKitColourPickerClient";
import { prisma } from "@/lib/prisma";

export default async function TeamKitColourPicker({ teamId }: { teamId: string }) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { name: true },
  });

  return (
    <section
      aria-label="Team settings"
      className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.02] p-4 sm:p-5"
    >
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
          Team settings
        </p>
        <h2 className="mt-1 text-lg font-semibold text-white">Kit and team display</h2>
        <p className="mt-1 text-sm leading-6 text-white/55">
          Manage this team&apos;s free-kit entitlement and the shirt colour shown across SIXFL.
        </p>
      </div>

      <FreeKitOfferControl teamId={teamId} teamName={team?.name ?? "This team"} />
      <TeamKitColourPickerClient teamId={teamId} />
    </section>
  );
}
