// ========================================
// File: src/lib/match-rules.ts
// ========================================

export const MATCH_RULES_VERSION = "Version 1.3 — August 2026";

export type MatchRuleSection = {
  title: string;
  points: string[];
};

export const matchRuleSections: MatchRuleSection[] = [
  {
    title: "Referee Decisions",
    points: [
      "Decisions of the referee regarding facts connected with play are final.",
      "An ordinary on-field decision will not be overturned merely because later video footage suggests that a different decision may have been made.",
      "Goals and match results will not normally be changed because of a retrospective disagreement with a refereeing decision made during play.",
      "There is no automatic right to a video review, and the availability or quality of footage may differ between matches.",
    ],
  },
  {
    title: "Use of Video Footage",
    points: [
      "Video footage may be reviewed for disciplinary, safeguarding, administrative and referee-development purposes.",
      "SIXFL may use footage to investigate serious misconduct, violence, abuse, mistaken identity, suspected cheating, the use of an ineligible player or another significant rule breach.",
      "Footage may also be used to correct an administrative error, such as an incorrectly entered score, where the referee's actual decision or the agreed final score is clear.",
      "Unless SIXFL has announced a formal competition-specific video-review process in advance, footage will not normally be used to re-referee a match, overturn an on-field decision or amend a result arising from that decision.",
      "SIXFL may still use footage privately to support referee feedback, training and performance review without changing the match result.",
    ],
  },
  {
    title: "Players and Substitutes",
    points: [
      "There is no maximum registered squad size.",
      "A maximum of nine players may take part for a team in any single fixture: six players on the pitch and up to three rolling substitutes.",
      "Every player who participates in the fixture, including any guest player, counts towards the nine-player limit.",
      "A team may only exceed the nine-player fixture limit with prior approval from SIXFL.",
    ],
  },
  {
    title: "Match Duration",
    points: [
      "Matches are typically played between 30–40 minutes in duration.",
      "Competition formats may allow games to be played without a half-time interval or requirement to change ends.",
      "Keep the night moving and follow the fixture schedule unless SIXFL or the venue confirms otherwise.",
    ],
  },
  {
    title: "Start of Play",
    points: [
      "The referee decides which team takes the kick-off, using a coin toss where time allows.",
      "The other team chooses which end to attack, unless the referee gives different instructions to keep the night on schedule.",
    ],
  },
  {
    title: "Kick-Off",
    points: [
      "A kick-off is used to start the match, restart play after a goal and start the second half where a second half is used.",
      "A goal may be scored directly from a kick-off.",
    ],
  },
  {
    title: "Ball In and Out of Play",
    points: [
      "The ball is out of play when it has wholly crossed the goal line or touchline, or when play has been stopped by the referee.",
      "The ball is in play at all other times, including rebounds from the goalpost, crossbar, boards or referee unless the referee stops play.",
    ],
  },
  {
    title: "Scoring",
    points: [
      "A goal is scored when the whole of the ball passes over the goal line, between the goalposts and under the crossbar, unless the rules say the restart cannot score directly.",
      "The team scoring the greater number of goals wins the match.",
    ],
  },
  {
    title: "Offside and Height Rules",
    points: [
      "There is no offside rule.",
      "There is no overhead height restriction unless the venue has a specific local safety rule.",
    ],
  },
  {
    title: "Free Kicks",
    points: [
      "All free kicks are direct and are awarded to the opposing team for offences in accordance with the rules of play.",
      "Opponents must stand at least five yards from the ball until it is in play.",
      "Where the rules require a free kick outside the goalkeeper area, place the ball five yards outside the area in line with the offence or the point where the ball entered the area.",
    ],
  },
  {
    title: "Penalty Area",
    points: [
      "A penalty kick may be awarded if a defender commits a direct-free-kick offence inside the penalty or goalkeeper area.",
      "If an attacking player enters the goalkeeper area and gains an advantage, the referee may award possession to the goalkeeper.",
      "If the goalkeeper handles the ball outside the goalkeeper area, award a free kick from where the offence happened.",
    ],
  },
  {
    title: "Kick-Ins",
    points: [
      "Kick-ins replace throw-ins when the ball leaves the pitch over the touchline.",
      "A goal cannot be scored directly from a kick-in.",
      "The ball should be stationary on or behind the line and opponents should give at least five yards where possible.",
    ],
  },
  {
    title: "Goalkeeper and Back-Pass Rules",
    points: [
      "Goalkeepers may restart play by throwing the ball underarm or overarm.",
      "Backpasses to the goalkeeper are allowed.",
      "However, if a player receives the ball from their own goalkeeper, that player may not pass it straight back to the goalkeeper until another player has touched the ball.",
      "If this keeper-return offence happens, award a free kick to the opposing team five yards outside the goalkeeper area, in line with the point where the ball entered the area.",
      "Goalkeepers may save or stop the ball with their feet, but may not kick the ball out from their hands.",
    ],
  },
  {
    title: "Guest Players",
    points: [
      "Teams may use a maximum of two guest players per match unless SIXFL has approved otherwise.",
      "Guest players may play a maximum of three matches for the same team during a season. After this point, the player must be registered as a permanent player for that team.",
      "Guest players must be agreed with the opposing captain and referee before kick-off.",
      "Guest players may not participate in playoff or final matches unless registered with the team.",
      "Teams may not use guest players as substitutes during a match.",
    ],
  },
  {
    title: "Discipline and Sin Bin Rule",
    points: [
      "Referees may use temporary suspensions, known as sin bins, for cautionable offences.",
      "A player shown a blue card is temporarily suspended from play.",
      "A second blue card in the same match results in permanent exclusion from the match.",
      "A red card results in immediate dismissal from the match.",
      "Serious disciplinary incidents may be reported to the relevant County FA.",
    ],
  },
];
