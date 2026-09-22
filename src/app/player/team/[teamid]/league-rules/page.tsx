import PlayerAppRulesPage from "@/components/player/PlayerAppRulesPage";
import {
  LEAGUE_RULES_EFFECTIVE_DATE,
  LEAGUE_RULES_VERSION,
  leagueRuleSections,
} from "@/lib/league-rules";

export const metadata = { title: "League Rules | SIXFL Player App" };

export default function PlayerLeagueRulesPage() {
  return (
    <PlayerAppRulesPage
      eyebrow="Player app"
      title="League Rules"
      intro="Competition, payments, conduct and fixture requirements for SIXFL teams and players."
      version={`Version ${LEAGUE_RULES_VERSION}`}
      effectiveDate={LEAGUE_RULES_EFFECTIVE_DATE}
      sections={leagueRuleSections}
    />
  );
}
