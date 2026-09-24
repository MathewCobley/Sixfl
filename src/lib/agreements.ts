import { prisma } from "@/lib/prisma";
import {
  PLAYER_AGREEMENT_EFFECTIVE_DATE,
  PLAYER_AGREEMENT_VERSION,
  playerAgreementSections,
} from "@/lib/player-agreement";
import {
  LEAGUE_AGREEMENT_EFFECTIVE_DATE,
  LEAGUE_AGREEMENT_VERSION,
  leagueAgreementSections,
} from "@/lib/league-agreement";
import {
  REFEREE_AGREEMENT_EFFECTIVE_DATE,
  REFEREE_AGREEMENT_VERSION,
  refereeAgreementSections,
} from "@/lib/referee-agreement";

export type AgreementType = "PLAYER" | "CAPTAIN" | "REFEREE";

export function getCurrentAgreement(type: AgreementType) {
  if (type === "PLAYER") {
    return {
      type,
      title: "Player Agreement",
      version: PLAYER_AGREEMENT_VERSION,
      effectiveDate: PLAYER_AGREEMENT_EFFECTIVE_DATE,
      intro:
        "You need to accept the current Player Agreement before continuing into the SIXFL player app.",
      checkboxLabel: "I have read and agree to the SIXFL Player Agreement.",
      sections: playerAgreementSections,
    };
  }

  if (type === "CAPTAIN") {
    return {
      type,
      title: "Captain Agreement",
      version: LEAGUE_AGREEMENT_VERSION,
      effectiveDate: LEAGUE_AGREEMENT_EFFECTIVE_DATE,
      intro:
        "You need to accept the current Captain Agreement before continuing into the SIXFL captain app.",
      checkboxLabel: "I have read and agree to the SIXFL Captain Agreement.",
      sections: leagueAgreementSections,
    };
  }

  return {
    type,
    title: "Referee Agreement",
    version: REFEREE_AGREEMENT_VERSION,
    effectiveDate: REFEREE_AGREEMENT_EFFECTIVE_DATE,
    intro:
      "You need to accept the current Referee Agreement before continuing into the SIXFL referee app.",
    checkboxLabel: "I have read and agree to the SIXFL Referee Agreement.",
    sections: refereeAgreementSections,
  };
}

export async function hasAcceptedCurrentAgreement(
  userId: string,
  type: AgreementType,
) {
  const current = getCurrentAgreement(type);
  const row = await prisma.agreementAcceptance.findUnique({
    where: {
      userId_agreementType_version: {
        userId,
        agreementType: type,
        version: current.version,
      },
    },
    select: { id: true },
  });
  return Boolean(row);
}
