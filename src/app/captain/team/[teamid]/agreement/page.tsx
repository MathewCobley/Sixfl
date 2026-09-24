import AppAgreementSections from "@/components/shared/AppAgreementSections";
import { requireCaptain } from "@/lib/requireCaptain";
import {
  LEAGUE_AGREEMENT_EFFECTIVE_DATE,
  LEAGUE_AGREEMENT_VERSION,
  leagueAgreementSections,
} from "@/lib/league-agreement";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CaptainAgreementPage({
  params,
}: {
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  return (
    <main className="space-y-3">
      <h1 className="sr-only">Captain Agreement</h1>
      <AppAgreementSections
        version={LEAGUE_AGREEMENT_VERSION}
        effectiveDate={LEAGUE_AGREEMENT_EFFECTIVE_DATE}
        intro="Your active SIXFL participation agreement as captain. It covers the responsibilities you accept when running and entering your team."
        sections={leagueAgreementSections}
      />
    </main>
  );
}
