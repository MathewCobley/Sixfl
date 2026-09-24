import PlayerAppRulesPage from "@/components/player/PlayerAppRulesPage";
import {
  PLAYER_AGREEMENT_EFFECTIVE_DATE,
  PLAYER_AGREEMENT_VERSION,
  playerAgreementSections,
} from "@/lib/player-agreement";

export const metadata = { title: "Player Agreement | SIXFL Player App" };

export default function PlayerAgreementPage() {
  return (
    <PlayerAppRulesPage
      eyebrow="Your agreement"
      title="Player Agreement"
      intro="The standards and responsibilities you agree to when you register and play in SIXFL."
      version={`Version ${PLAYER_AGREEMENT_VERSION}`}
      effectiveDate={PLAYER_AGREEMENT_EFFECTIVE_DATE}
      sections={playerAgreementSections}
    />
  );
}
