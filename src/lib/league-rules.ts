// ========================================
// File: src/lib/league-rules.ts
// ========================================

export const LEAGUE_RULES_VERSION = "2.1";
export const LEAGUE_RULES_EFFECTIVE_DATE = "22 August 2026";
export const LEAGUE_RULES_NEXT_REVIEW = "22 August 2027";

export type LeagueRuleSection = {
  title: string;
  points: string[];
};

export const leagueRuleSections: LeagueRuleSection[] = [
  {
    title: "1. Scope, Acceptance and Rule Hierarchy",
    points: [
      "These League Rules apply to all SIXFL teams, captains, players and league fixtures unless SIXFL has expressly notified a competition-specific or venue-specific rule.",
      "By registering a team, joining a team or taking part in a SIXFL fixture, participants agree to comply with the rules in force for that competition.",
      "The League Rules govern league administration, eligibility, discipline, payments, fixtures and competition outcomes. The Match Rules govern on-pitch play. A notified venue safety rule or competition-specific rule applies where it is more specific.",
      "Where documents appear to conflict on an administrative or competition matter, these League Rules take priority. Mandatory venue safety requirements always apply.",
      "SIXFL keeps an internal archive of superseded rule versions. Unless a change is required for safety or law, an incident will normally be considered under the rules that were in force when it occurred.",
    ],
  },
  {
    title: "2. Team Registration and Captain Responsibility",
    points: [
      "Teams must complete the SIXFL registration process and provide accurate captain and player details.",
      "Team names, badges and other public-facing team identity must be suitable for public use. SIXFL may reject or require a change to any name or branding it reasonably considers discriminatory, hateful, abusive, obscene, threatening or otherwise unsuitable for a community football competition.",
      "SIXFL may require a team to change its name or public-facing branding after registration if a suitability concern later becomes apparent.",
      "The registered captain or organiser acts as the primary team contact and is responsible for making sure players are aware of fixtures, payment responsibilities, safety requirements and league rules.",
      "Teams must keep contact and squad information reasonably up to date. Where a SIXFL feature requires an email address or other contact detail, the team is responsible for providing accurate information.",
    ],
  },
  {
    title: "3. Player Eligibility and Guest Players",
    points: [
      "A player may take part if they are properly registered to the team or are being used as a permitted guest player in accordance with the Match Rules.",
      "Teams must not field an ineligible player, deliberately misrepresent a player's identity or use another person's registration.",
      "SIXFL may amend a result, remove a player from a fixture, impose disciplinary action or take another reasonable competition measure where an eligibility breach is established.",
    ],
  },
  {
    title: "4. Squad Size and Matchday Player Limit",
    points: [
      "There is no maximum registered squad size.",
      "A maximum of nine players may take part for a team in any single fixture: six players on the pitch and up to three rolling substitutes.",
      "Every player who participates in the fixture, including any permitted guest player, counts towards the nine-player limit.",
      "A team may only exceed the nine-player matchday limit with prior approval from SIXFL.",
    ],
  },
  {
    title: "5. Safety Equipment",
    points: [
      "Shin pads are mandatory for every player taking part in a SIXFL fixture.",
      "The referee may prevent a player from taking part, or require a player to leave the pitch until the issue is corrected, if required safety equipment is not being worn.",
      "Repeated failure to comply with safety requirements may result in a conduct warning, disciplinary action or review of the team's participation in the league.",
    ],
  },
  {
    title: "6. Respect and Conduct",
    points: [
      "Players, captains and spectators must behave respectfully towards referees, opponents, venue staff and SIXFL staff.",
      "Abuse, threats, intimidation, violence, serious misconduct, repeated dissent or conduct which materially disrupts a fixture may lead to warnings, formal conduct notices, suspension, removal from a fixture or removal from the league.",
      "A captain is expected to assist with the behaviour of their team and spectators where reasonably possible.",
    ],
  },
  {
    title: "7. Referee Authority, Cards and Dismissals",
    points: [
      "Decisions of the referee regarding facts connected with play are final.",
      "A player shown a red card is dismissed from the match and must promptly leave the playing area and any nearby area the referee reasonably directs them to leave.",
      "A dismissed player who refuses or unreasonably delays complying with an instruction to leave may commit a further disciplinary offence. If that conduct prevents the match from continuing safely or properly, the referee may abandon the fixture.",
      "Ordinary on-field decisions will not normally be retrospectively re-refereed because later footage or a different account suggests another decision could have been made.",
    ],
  },
  {
    title: "8. Results and League Table",
    points: [
      "Match results are recorded by the referee or league administrator and used to update the standings.",
      "SIXFL may correct an administrative recording error or amend a result where serious misconduct, cheating, an eligibility breach or another significant competition breach is established.",
      "A disagreement with an ordinary refereeing decision made during play does not, by itself, provide grounds to change a result.",
    ],
  },
  {
    title: "9. Abandoned Matches",
    points: [
      "Where a referee abandons a match because of the conduct of one team, the referee's decision to abandon the match is final.",
      "The team whose conduct caused the abandonment is responsible for payment of both its own match fee and the opposing team's match fee, irrespective of how much of the fixture had been played.",
      "The result and league outcome of any abandoned fixture will be determined by SIXFL at its sole discretion after taking into account the circumstances available to it.",
      "SIXFL may allow the score at the time of abandonment to stand, award the match to either team, record a forfeit, leave the result pending while an administrative decision is made, or take any other competition action it considers appropriate.",
      "Where SIXFL records a forfeit and does not expressly determine a different score, the administrative forfeit result will be 3–0.",
      "A result decision, fee decision and disciplinary decision are separate administrative decisions and may all apply to the same incident.",
    ],
  },
  {
    title: "10. Fixture Confirmation",
    points: [
      "Teams should confirm fixture availability no later than 72 hours before kick-off or raise a genuine fixture issue through the SIXFL system before that deadline.",
      "A £10 late-confirmation admin fee may be applied where an avoidable missed confirmation creates additional chasing, rearranging or administrative work.",
      "SIXFL may send reminders or warnings where practical, but a warning is not a prerequisite to enforcement of a published confirmation requirement.",
    ],
  },
  {
    title: "11. Cancellations, No-Shows and Fixture Changes",
    points: [
      "A team that cannot fulfil a fixture must notify SIXFL directly as early as possible. Telling or agreeing something only with the opposition does not cancel or rearrange a SIXFL fixture.",
      "A team cancelling less than 24 hours before kick-off remains liable for its own match fee unless SIXFL expressly agrees otherwise.",
      "A no-show or repeated avoidable late cancellation may also result in a forfeit, disciplinary action or review of the team's place in the league.",
      "SIXFL may postpone, cancel or rearrange fixtures because of venue availability, weather, safety, operational requirements or exceptional circumstances.",
    ],
  },
  {
    title: "12. Match Fees, Payment and Admin Fees",
    points: [
      "The standard team match fee is £40 per fixture unless SIXFL has agreed a different fee for that team, fixture or competition.",
      "The captain remains responsible for making sure the overall team fee is covered even where individual player payment links or squad-payment tools are used.",
      "Match fees are due on match day unless SIXFL has agreed otherwise.",
      "A £10 late-payment admin fee may be applied where a match fee remains unpaid more than seven days after the due date and SIXFL has to carry out additional payment-chasing or administration.",
      "SIXFL may send payment reminders or warnings where practical, but teams should not rely on receiving a warning before paying an amount that is already due.",
      "An admin fee is additional to the underlying match fee. Applying, waiving or removing an admin fee does not alter the original match fee unless SIXFL expressly changes that charge.",
    ],
  },
  {
    title: "13. Video Footage and Other Evidence",
    points: [
      "Video footage may be reviewed for disciplinary, safeguarding, administrative and referee-development purposes.",
      "Footage may be incomplete, obstructed, silent, recorded from a limited angle or fail to capture a conversation or event outside the camera view. The absence of an event from a particular recording does not by itself establish that the event did not occur.",
      "When considering an administrative or disciplinary issue, SIXFL may take account of referee reports, available footage, contemporaneous messages, system records, player or captain accounts, witness information and any other material it considers relevant.",
      "There is no automatic right to a video review, to a frame-by-frame re-refereeing process or to have an ordinary on-field decision overturned because footage is available.",
      "Where footage clearly establishes an administrative recording error or other matter which SIXFL considers material, SIXFL may take it into account.",
    ],
  },
  {
    title: "14. Discipline and Formal Conduct Notices",
    points: [
      "SIXFL may issue informal warnings, formal conduct notices, fixture sanctions, player suspensions, team sanctions or removal from the league where conduct warrants it.",
      "Serious incidents may be reported to the relevant County FA, venue, safeguarding authority or other appropriate body.",
      "A disciplinary outcome may apply in addition to any match result or financial consequence arising from the same incident.",
    ],
  },
  {
    title: "15. Reviews, Appeals and Final Decisions",
    points: [
      "There is no automatic right to an independent appeal, independent hearing or external review of a SIXFL league decision unless SIXFL has expressly created such a process for the competition concerned.",
      "SIXFL may reconsider an administrative or disciplinary decision where genuinely new and material evidence is provided, or where an obvious administrative error is identified.",
      "Any reconsideration is an internal SIXFL process unless SIXFL expressly states otherwise. SIXFL decides what evidence is relevant and what weight to give it.",
      "Once SIXFL has considered the material available and communicated a final decision, it may close the matter and is not required to continue responding to repeated arguments which do not contain genuinely new material evidence.",
      "League decisions are final unless these rules, a competition-specific rule or SIXFL expressly states otherwise.",
    ],
  },
  {
    title: "16. League Management and Rule Changes",
    points: [
      "SIXFL reserves the right to make reasonable operational and competition decisions in the interests of fairness, safety and the effective running of the league.",
      "SIXFL may review a team's continued participation where there is repeated non-payment, repeated late cancellation, persistent misconduct or another serious operational problem.",
      "Updated rule versions will be dated and versioned. Superseded versions will be retained internally so that SIXFL can identify the wording that applied at an earlier date.",
    ],
  },
];
