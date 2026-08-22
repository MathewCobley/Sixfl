// ========================================
// File: src/lib/match-rules.ts
// ========================================

export const MATCH_RULES_VERSION = "Version 2.1 — August 2026";

export type MatchRuleSection = {
  title: string;
  points: string[];
};

export const matchRuleSections: MatchRuleSection[] = [
  {
    title: "Rule Scope and Hierarchy",
    points: [
      "These Match Rules govern on-pitch play in SIXFL fixtures. The League Rules govern competition administration, eligibility, payments, discipline and league outcomes.",
      "A competition-specific rule or mandatory venue safety rule notified by SIXFL applies where it is more specific.",
      "Where the Match Rules and League Rules appear to conflict on an administrative matter, the League Rules take priority.",
    ],
  },
  {
    title: "Referee Decisions",
    points: [
      "Decisions of the referee regarding facts connected with play are final.",
      "An ordinary on-field decision will not be overturned merely because later video footage suggests that a different decision may have been made.",
      "Goals and match results will not normally be changed because of a retrospective disagreement with a refereeing decision made during play.",
      "There is no automatic right to a video review.",
    ],
  },
  {
    title: "Use of Video Footage and Other Evidence",
    points: [
      "Video footage may be reviewed for disciplinary, safeguarding, administrative and referee-development purposes.",
      "SIXFL may use footage to investigate serious misconduct, violence, abuse, mistaken identity, suspected cheating, the use of an ineligible player or another significant rule breach.",
      "Footage may be incomplete, obstructed, silent, recorded from a limited angle or fail to capture an incident or conversation outside the camera view. Something not appearing on a particular recording does not by itself establish that it did not happen.",
      "SIXFL may consider referee reports, available footage, contemporaneous messages, system records, witness information and player or captain accounts when making an administrative or disciplinary decision.",
      "Unless SIXFL has announced a formal competition-specific video-review process in advance, footage will not normally be used to re-referee a match, overturn an ordinary on-field decision or amend a result arising solely from that decision.",
    ],
  },
  {
    title: "Players and Substitutes",
    points: [
      "There is no maximum registered squad size.",
      "A maximum of nine players may take part for a team in any single fixture: six players on the pitch and up to three rolling substitutes.",
      "Every player who participates in the fixture, including any permitted guest player, counts towards the nine-player limit.",
      "A team may only exceed the nine-player fixture limit with prior approval from SIXFL.",
    ],
  },
  {
    title: "Required Safety Equipment",
    points: [
      "Shin pads are mandatory for every player taking part in a SIXFL fixture.",
      "A referee may prevent a player from taking part, or require them to leave the pitch until the issue is corrected, if required safety equipment is not being worn.",
      "Repeated failure to comply with safety-equipment requirements may be reported to SIXFL for disciplinary action.",
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
      "Goals may be scored directly from a kick-off.",
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
      "Where a free kick is required within five yards of the penalty area or within the penalty area, place the ball five yards outside the area in line with the offence or the point where the ball entered the area.",
    ],
  },
  {
    title: "Penalty Area",
    points: [
      "If a defending player enters their own penalty area and either touches the ball or affects play in any way, as determined by the referee, a penalty kick is awarded.",
      "If an attacking player enters the goalkeeper area and gains an advantage, the referee may award possession to the goalkeeper.",
      "If the goalkeeper handles the ball outside the goalkeeper area, award a free kick from where the offence happened.",
    ],
  },
  {
    title: "Kick-Ins",
    points: [
      "Kick-ins replace throw-ins when the ball leaves the pitch over the touchline.",
      "A goal cannot be scored directly from a kick-in.",
      "A kick-in may not be played directly to the taker's own goalkeeper. Another player must touch the ball before it is played to the goalkeeper.",
      "If the goalkeeper plays or receives the ball directly from a teammate's kick-in, award a free kick to the opposing team from where the goalkeeper first plays the ball. If that point is inside the goalkeeper area, take the free kick five yards outside the area in line with the offence.",
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
      "Goalkeepers may save or stop the ball with their feet, but may not kick the ball out.",
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
    title: "Discipline, Cards and Dismissals",
    points: [
      "Referees may use temporary suspensions, known as sin bins, for cautionable offences.",
      "A player shown a blue card is temporarily suspended from play for a period of at least three minutes, as determined by the referee.",
      "A second blue card in the same match results in permanent exclusion from the match.",
      "A red card results in immediate dismissal from the match.",
      "A dismissed player must promptly leave the playing area and any nearby area the referee reasonably directs them to leave.",
      "Refusal or unreasonable delay in complying with an instruction to leave may be treated as further misconduct and may result in the fixture being abandoned if the referee considers that the match cannot safely or properly continue.",
      "Serious disciplinary incidents may be reported to the relevant County FA.",
    ],
  },
  {
    title: "Abandoned Matches",
    points: [
      "Where a referee abandons a match because of the conduct of one team, the referee's decision to abandon the match is final.",
      "The team whose conduct caused the abandonment is responsible for payment of both its own match fee and the opposing team's match fee.",
      "The result and league outcome of any abandoned fixture will be determined by SIXFL at its sole discretion, taking into account the circumstances available to it.",
      "SIXFL may allow the score at the time of abandonment to stand, award the match to either team, record a forfeit, leave the result pending while an administrative decision is made or take any other competition action it considers appropriate.",
      "Where SIXFL records a forfeit and does not expressly determine a different score, the administrative forfeit result will be 3–0.",
      "A result decision, fee decision and disciplinary decision are separate and may all apply to the same incident.",
    ],
  },
];
