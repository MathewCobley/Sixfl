import PlayerAppRulesPage from "@/components/player/PlayerAppRulesPage";
import {
  MATCH_RULES_EFFECTIVE_DATE,
  MATCH_RULES_VERSION,
  matchRuleSections,
} from "@/lib/match-rules";

export const metadata = { title: "Match Rules | SIXFL Player App" };

export default function PlayerMatchRulesPage() {
  return (
    <PlayerAppRulesPage
      eyebrow="Player app"
      title="Match Rules"
      intro="The rules and procedures used on the pitch in SIXFL fixtures."
      version={MATCH_RULES_VERSION}
      effectiveDate={MATCH_RULES_EFFECTIVE_DATE}
      sections={matchRuleSections}
    />
  );
}
