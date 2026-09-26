import PlayerAppRulesPage from "@/components/player/PlayerAppRulesPage";
import {
  LEAGUE_RULES_EFFECTIVE_DATE,
  LEAGUE_RULES_VERSION,
  leagueRuleSections,
} from "@/lib/league-rules";
import { requireCaptain } from "@/lib/requireCaptain";

export const metadata = { title: "League Rules | SIXFL Captain App" };

export default async function CaptainLeagueRulesPage({
  params,
}: {
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  return (
    <PlayerAppRulesPage
      eyebrow="Captain app"
      title="League Rules"
      intro="Competition, payments, conduct and fixture requirements for SIXFL teams and captains."
      version={`Version ${LEAGUE_RULES_VERSION}`}
      effectiveDate={LEAGUE_RULES_EFFECTIVE_DATE}
      sections={leagueRuleSections}
    />
  );
}
