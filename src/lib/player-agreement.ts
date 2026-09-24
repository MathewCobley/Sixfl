export const PLAYER_AGREEMENT_VERSION = "1.0";
export const PLAYER_AGREEMENT_EFFECTIVE_DATE = "24 September 2026";

export type PlayerAgreementSection = {
  title: string;
  points: string[];
};

export const playerAgreementSections: PlayerAgreementSection[] = [
  {
    title: "1. Registration and eligibility",
    points: [
      "Keep your own player details accurate and use your own SIXFL account.",
      "Only play when you are properly registered, selected or approved as a guest under the current SIXFL rules.",
      "Do not play under another person's name or deliberately give false player information.",
    ],
  },
  {
    title: "2. Safety",
    points: [
      "Shin pads must be worn during SIXFL matches.",
      "Follow venue requirements, footwear rules and reasonable safety instructions from the referee or SIXFL.",
      "You are responsible for deciding whether you are fit to take part. A referee may stop you playing if required safety equipment is missing or participation is unsafe.",
    ],
  },
  {
    title: "3. Respect and conduct",
    points: [
      "Treat teammates, opponents, referees, venue staff and SIXFL staff with respect.",
      "Abuse, threats, intimidation, violence, discriminatory conduct or repeated dissent may lead to warnings, suspension or removal from SIXFL competitions.",
      "If asked to leave the playing area following a dismissal, do so promptly and follow the referee's reasonable instructions.",
    ],
  },
  {
    title: "4. Matches and referee decisions",
    points: [
      "Play to the current Match Rules and any venue-specific instructions in force for the fixture.",
      "Referee decisions about facts connected with play are final on the night.",
      "If there is a genuine administrative issue, raise it through your captain or the appropriate SIXFL route rather than continuing an argument on the pitch.",
    ],
  },
  {
    title: "5. Match fees",
    points: [
      "Where a match fee or player payment request is assigned to you, pay it by the stated deadline or contact your captain or SIXFL if there is a genuine problem.",
      "Repeated or unresolved unpaid match fees may result in your ability to be selected or participate being suspended until the account is resolved.",
      "A player's individual payment arrangement does not remove the team's overall responsibility for its fixture fee.",
    ],
  },
  {
    title: "6. Squad and availability",
    points: [
      "Respond to availability requests as accurately as you reasonably can and tell your captain if your availability changes.",
      "Do not knowingly take part in a way that breaches guest-player, registration or player-limit rules.",
      "SIXFL may correct player records where duplicate accounts, incorrect identities or administrative errors are identified.",
    ],
  },
  {
    title: "7. Match records and footage",
    points: [
      "SIXFL may record match information such as appearances, goals, assists, ratings, discipline and results.",
      "Matches may be filmed and footage may be used for highlights, competition content, administration, discipline, safeguarding or referee development where appropriate.",
      "Personal data is handled under the SIXFL Privacy Policy.",
    ],
  },
  {
    title: "8. Changes to this agreement",
    points: [
      "The Player Agreement is versioned and may be updated when SIXFL rules or operating requirements change.",
      "Where a material change affects players, SIXFL may require players to accept the new version before continuing to use relevant app features or take part.",
    ],
  },
];
