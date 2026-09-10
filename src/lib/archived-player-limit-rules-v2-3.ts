import type { ArchivedRuleDocument } from "@/lib/rules-archive";

// Immutable snapshots of the COMPLETE outgoing production-prepared documents.
// Base revision: 5061e943ce03b62dd6d990ef3498a6a1cdd1bf8e.
// Match Rules v2.3 displayed an August effective date despite its September label;
// retain that discrepancy rather than inventing a retrospective effective date.
export const archivedPlayerLimitRulesV23: ArchivedRuleDocument[] = [
  {
    "id": "league-rules-2-3",
    "document": "League Rules",
    "version": "2.3",
    "effectiveDate": "4 September 2026",
    "supersededDate": "10 September 2026 (on publication of v2.4)",
    "status": "Superseded",
    "sections": [
      {
        "title": "1. Scope, Acceptance and Rule Hierarchy",
        "points": [
          "These League Rules apply to all SIXFL teams, captains, players and league fixtures unless SIXFL has expressly notified a competition-specific or venue-specific rule.",
          "By registering a team, joining a team or taking part in a SIXFL fixture, participants agree to comply with the rules in force for that competition.",
          "The League Rules govern league administration, eligibility, discipline, payments, fixtures and competition outcomes. The Match Rules govern on-pitch play. A notified venue safety rule or competition-specific rule applies where it is more specific.",
          "Where documents appear to conflict on an administrative or competition matter, these League Rules take priority. Mandatory venue safety requirements always apply.",
          "SIXFL keeps an internal archive of superseded rule versions. Unless a change is required for safety or law, an incident will normally be considered under the rules that were in force when it occurred."
        ]
      },
      {
        "title": "2. Team Registration and Captain Responsibility",
        "points": [
          "Teams must complete the SIXFL registration process and provide accurate captain and player details.",
          "Team names, badges and other public-facing team identity must be suitable for public use. SIXFL may reject or require a change to any name or branding it reasonably considers discriminatory, hateful, abusive, obscene, threatening or otherwise unsuitable for a community football competition.",
          "SIXFL may require a team to change its name or public-facing branding after registration if a suitability concern later becomes apparent.",
          "The registered captain or organiser acts as the primary team contact and is responsible for making sure players are aware of fixtures, payment responsibilities, safety requirements and league rules.",
          "Teams must keep contact and squad information reasonably up to date. Where a SIXFL feature requires an email address or other contact detail, the team is responsible for providing accurate information."
        ]
      },
      {
        "title": "3. Player Eligibility and Guest Players",
        "points": [
          "A player may only be permanently registered to one team within the same SIXFL league and season.",
          "A player may be permanently registered to different teams in different SIXFL leagues or competitions.",
          "A player who is permanently registered to another team in the same league may only take part for a different team as a guest player with prior approval from SIXFL for that fixture.",
          "A guest appearance does not create a second permanent registration and remains subject to the guest-player limits in the Match Rules.",
          "A player may take part if they are properly registered to the team or are being used as a permitted guest player in accordance with these League Rules and the Match Rules.",
          "Teams must not field an ineligible player, deliberately misrepresent a player's identity or use another person's registration.",
          "Where a team fields an ineligible player, SIXFL may overturn the result and record the fixture as a 3–0 forfeit loss against that team, together with any other disciplinary or competition action considered appropriate.",
          "Where both teams are found to have fielded ineligible players, SIXFL will determine the appropriate competition outcome rather than automatically awarding either team a 3–0 win."
        ]
      },
      {
        "title": "4. Squad Size and Matchday Player Limit",
        "points": [
          "There is no maximum registered squad size.",
          "A maximum of nine players may take part for a team in any single fixture: six players on the pitch and up to three rolling substitutes.",
          "Only six players may be on the pitch for a team at any one time. Fielding more than six players at any time may result in the fixture being forfeited and recorded as a 3–0 defeat, at SIXFL's discretion.",
          "Every player who participates in the fixture, including any permitted guest player, counts towards the nine-player limit.",
          "A team may only exceed the nine-player matchday limit with prior approval from SIXFL."
        ]
      },
      {
        "title": "5. Safety Equipment",
        "points": [
          "Shin pads are mandatory for every player taking part in a SIXFL fixture.",
          "The referee may prevent a player from taking part, or require a player to leave the pitch until the issue is corrected, if required safety equipment is not being worn.",
          "Repeated failure to comply with safety requirements may result in a conduct warning, disciplinary action or review of the team's participation in the league."
        ]
      },
      {
        "title": "6. Respect and Conduct",
        "points": [
          "Players, captains and spectators must behave respectfully towards referees, opponents, venue staff and SIXFL staff.",
          "Abuse, threats, intimidation, violence, serious misconduct, repeated dissent or conduct which materially disrupts a fixture may lead to warnings, formal conduct notices, suspension, removal from a fixture or removal from the league.",
          "A captain is expected to assist with the behaviour of their team and spectators where reasonably possible."
        ]
      },
      {
        "title": "7. Referee Authority, Cards and Dismissals",
        "points": [
          "Decisions of the referee regarding facts connected with play are final.",
          "A player shown a red card is dismissed from the match and must promptly leave the playing area and any nearby area the referee reasonably directs them to leave.",
          "A dismissed player who refuses or unreasonably delays complying with an instruction to leave may commit a further disciplinary offence. If that conduct prevents the match from continuing safely or properly, the referee may abandon the fixture.",
          "Ordinary on-field decisions will not normally be retrospectively re-refereed because later footage or a different account suggests another decision could have been made."
        ]
      },
      {
        "title": "8. Results and League Table",
        "points": [
          "Match results are recorded by the referee or league administrator and used to update the standings.",
          "SIXFL may correct an administrative recording error or amend a result where serious misconduct, cheating, an eligibility breach or another significant competition breach is established.",
          "A disagreement with an ordinary refereeing decision made during play does not, by itself, provide grounds to change a result."
        ]
      },
      {
        "title": "9. Abandoned Matches",
        "points": [
          "Where a referee abandons a match because of the conduct of one team, the referee's decision to abandon the match is final.",
          "The team whose conduct caused the abandonment is responsible for payment of both its own match fee and the opposing team's match fee, irrespective of how much of the fixture had been played.",
          "The result and league outcome of any abandoned fixture will be determined by SIXFL at its sole discretion after taking into account the circumstances available to it.",
          "SIXFL may allow the score at the time of abandonment to stand, award the match to either team, record a forfeit, leave the result pending while an administrative decision is made, or take any other competition action it considers appropriate.",
          "Where SIXFL records a forfeit and does not expressly determine a different score, the administrative forfeit result will be 3–0.",
          "A result decision, fee decision and disciplinary decision are separate administrative decisions and may all apply to the same incident."
        ]
      },
      {
        "title": "10. Fixture Confirmation",
        "points": [
          "Teams should confirm fixture availability no later than 72 hours before kick-off or raise a genuine fixture issue through the SIXFL system before that deadline.",
          "A £10 late-confirmation admin fee may be applied where an avoidable missed confirmation creates additional chasing, rearranging or administrative work.",
          "SIXFL may send reminders or warnings where practical, but a warning is not a prerequisite to enforcement of a published confirmation requirement."
        ]
      },
      {
        "title": "11. Cancellations, No-Shows and Fixture Changes",
        "points": [
          "A team that cannot fulfil a fixture must notify SIXFL directly as early as possible. Telling or agreeing something only with the opposition does not cancel or rearrange a SIXFL fixture.",
          "A team cancelling less than 24 hours before kick-off remains liable for its own match fee unless SIXFL expressly agrees otherwise.",
          "Where a team has confirmed a fixture and then fails to attend without SIXFL agreeing a cancellation or rearrangement, that team is responsible for both its own match fee and the opposing team's match fee.",
          "The opposing team will have no match fee due for a confirmed-fixture no-show caused by the other team. Where the opposing team has already paid, SIXFL will return the amount received as team credit where applicable.",
          "A no-show may also result in a forfeit, disciplinary action or review of the team's place in the league. Where SIXFL records a forfeit and does not expressly determine a different score, the administrative forfeit result is 3–0.",
          "SIXFL may postpone, cancel or rearrange fixtures because of venue availability, weather, safety, operational requirements or exceptional circumstances."
        ]
      },
      {
        "title": "12. Match Fees, Payment and Admin Fees",
        "points": [
          "The standard team match fee is £40 per fixture unless SIXFL has agreed a different fee for that team, fixture or competition.",
          "The captain remains responsible for making sure the overall team fee is covered even where individual player payment links or squad-payment tools are used.",
          "Match fees are due on match day unless SIXFL has agreed otherwise.",
          "A £10 late-payment admin fee may be applied where a match fee remains unpaid more than seven days after the due date and SIXFL has to carry out additional payment-chasing or administration.",
          "SIXFL may send payment reminders or warnings where practical, but teams should not rely on receiving a warning before paying an amount that is already due.",
          "An admin fee is additional to the underlying match fee. Applying, waiving or removing an admin fee does not alter the original match fee unless SIXFL expressly changes that charge."
        ]
      },
      {
        "title": "13. Video Footage and Other Evidence",
        "points": [
          "Video footage may be reviewed for disciplinary, safeguarding, administrative and referee-development purposes.",
          "Footage may be incomplete, obstructed, silent, recorded from a limited angle or fail to capture a conversation or event outside the camera view. The absence of an event from a particular recording does not by itself establish that the event did not occur.",
          "When considering an administrative or disciplinary issue, SIXFL may take account of referee reports, available footage, contemporaneous messages, system records, player or captain accounts, witness information and any other material it considers relevant.",
          "There is no automatic right to a video review, to a frame-by-frame re-refereeing process or to have an ordinary on-field decision overturned because footage is available.",
          "Where footage clearly establishes an administrative recording error or other matter which SIXFL considers material, SIXFL may take it into account."
        ]
      },
      {
        "title": "14. Discipline and Formal Conduct Notices",
        "points": [
          "SIXFL may issue informal warnings, formal conduct notices, fixture sanctions, player suspensions, team sanctions or removal from the league where conduct warrants it.",
          "Serious incidents may be reported to the relevant County FA, venue, safeguarding authority or other appropriate body.",
          "A disciplinary outcome may apply in addition to any match result or financial consequence arising from the same incident."
        ]
      },
      {
        "title": "15. Reviews, Appeals and Final Decisions",
        "points": [
          "There is no automatic right to an independent appeal, independent hearing or external review of a SIXFL league decision unless SIXFL has expressly created such a process for the competition concerned.",
          "SIXFL may reconsider an administrative or disciplinary decision where genuinely new and material evidence is provided, or where an obvious administrative error is identified.",
          "Any reconsideration is an internal SIXFL process unless SIXFL expressly states otherwise. SIXFL decides what evidence is relevant and what weight to give it.",
          "Once SIXFL has considered the material available and communicated a final decision, it may close the matter and is not required to continue responding to repeated arguments which do not contain genuinely new material evidence.",
          "League decisions are final unless these rules, a competition-specific rule or SIXFL expressly states otherwise."
        ]
      },
      {
        "title": "16. League Management and Rule Changes",
        "points": [
          "SIXFL reserves the right to make reasonable operational and competition decisions in the interests of fairness, safety and the effective running of the league.",
          "SIXFL may review a team's continued participation where there is repeated non-payment, repeated late cancellation, persistent misconduct or another serious operational problem.",
          "Updated rule versions will be dated and versioned. Superseded versions will be retained internally so that SIXFL can identify the wording that applied at an earlier date."
        ]
      }
    ]
  },
  {
    "id": "match-rules-2-3",
    "document": "Match Rules",
    "version": "2.3",
    "effectiveDate": "22 August 2026 (date displayed; version label said September 2026)",
    "supersededDate": "10 September 2026 (on publication of v2.4)",
    "status": "Superseded",
    "sections": [
      {
        "title": "Rule Scope and Hierarchy",
        "points": [
          "These Match Rules govern on-pitch play in SIXFL fixtures. The League Rules govern competition administration, eligibility, payments, discipline and league outcomes.",
          "A competition-specific rule or mandatory venue safety rule notified by SIXFL applies where it is more specific.",
          "Where the Match Rules and League Rules appear to conflict on an administrative matter, the League Rules take priority."
        ]
      },
      {
        "title": "Referee Decisions",
        "points": [
          "Decisions of the referee regarding facts connected with play are final.",
          "An ordinary on-field decision will not be overturned merely because later video footage suggests that a different decision may have been made.",
          "Goals and match results will not normally be changed because of a retrospective disagreement with a refereeing decision made during play.",
          "There is no automatic right to a video review."
        ]
      },
      {
        "title": "Use of Video Footage and Other Evidence",
        "points": [
          "Video footage may be reviewed for disciplinary, safeguarding, administrative and referee-development purposes.",
          "SIXFL may use footage to investigate serious misconduct, violence, abuse, mistaken identity, suspected cheating, the use of an ineligible player or another significant rule breach.",
          "Footage may be incomplete, obstructed, silent, recorded from a limited angle or fail to capture an incident or conversation outside the camera view. Something not appearing on a particular recording does not by itself establish that it did not happen.",
          "SIXFL may consider referee reports, available footage, contemporaneous messages, system records, witness information and player or captain accounts when making an administrative or disciplinary decision.",
          "Unless SIXFL has announced a formal competition-specific video-review process in advance, footage will not normally be used to re-referee a match, overturn an ordinary on-field decision or amend a result arising solely from that decision."
        ]
      },
      {
        "title": "Players and Substitutes",
        "points": [
          "There is no maximum registered squad size.",
          "A maximum of nine players may take part for a team in any single fixture: six players on the pitch and up to three rolling substitutes.",
          "Only six players may be on the pitch for a team at any one time. Fielding more than six players at any time may result in the fixture being forfeited and recorded as a 3–0 defeat, at SIXFL's discretion.",
          "Every player who participates in the fixture, including any permitted guest player, counts towards the nine-player limit.",
          "A team may only exceed the nine-player fixture limit with prior approval from SIXFL."
        ]
      },
      {
        "title": "Required Safety Equipment",
        "points": [
          "Shin pads are mandatory for every player taking part in a SIXFL fixture.",
          "A referee may prevent a player from taking part, or require them to leave the pitch until the issue is corrected, if required safety equipment is not being worn.",
          "Repeated failure to comply with safety-equipment requirements may be reported to SIXFL for disciplinary action."
        ]
      },
      {
        "title": "Match Duration",
        "points": [
          "Matches are typically played between 30–40 minutes in duration.",
          "Competition formats may allow games to be played without a half-time interval or requirement to change ends.",
          "Keep the night moving and follow the fixture schedule unless SIXFL or the venue confirms otherwise."
        ]
      },
      {
        "title": "Start of Play",
        "points": [
          "The referee decides which team takes the kick-off, using a coin toss where time allows.",
          "The other team chooses which end to attack, unless the referee gives different instructions to keep the night on schedule."
        ]
      },
      {
        "title": "Kick-Off",
        "points": [
          "A kick-off is used to start the match, restart play after a goal and start the second half where a second half is used.",
          "A goal may be scored directly from a kick-off."
        ]
      },
      {
        "title": "Ball In and Out of Play",
        "points": [
          "The ball is out of play when it has wholly crossed the goal line or touchline, or when play has been stopped by the referee.",
          "The ball is in play at all other times, including rebounds from the goalpost, crossbar, boards or referee unless the referee stops play."
        ]
      },
      {
        "title": "Scoring",
        "points": [
          "A goal is scored when the whole of the ball passes over the goal line, between the goalposts and under the crossbar, unless the rules say the restart cannot score directly.",
          "Goals may be scored directly from a kick-off.",
          "The team scoring the greater number of goals wins the match."
        ]
      },
      {
        "title": "Offside and Height Rules",
        "points": [
          "There is no offside rule.",
          "There is no overhead height restriction unless the venue has a specific local safety rule."
        ]
      },
      {
        "title": "Free Kicks",
        "points": [
          "All free kicks are direct and are awarded to the opposing team for offences in accordance with the rules of play.",
          "Opponents must stand at least five yards from the ball until it is in play.",
          "Where a free kick is required within five yards of the penalty area or within the penalty area, place the ball five yards outside the area in line with the offence or the point where the ball entered the area."
        ]
      },
      {
        "title": "Penalty Area",
        "points": [
          "If a defending player enters their own penalty area and either touches the ball or affects play in any way, as determined by the referee, a penalty kick is awarded.",
          "If an attacking player enters the goalkeeper area and gains an advantage, the referee may award possession to the goalkeeper.",
          "If the goalkeeper handles the ball outside the goalkeeper area, a penalty kick is awarded to the opposing team."
        ]
      },
      {
        "title": "Kick-Ins",
        "points": [
          "Kick-ins replace throw-ins when the ball leaves the pitch over the touchline.",
          "A goal cannot be scored directly from a kick-in.",
          "A kick-in may not be played directly to the taker's own goalkeeper. Another player must touch the ball before it is played to the goalkeeper.",
          "If the goalkeeper plays or receives the ball directly from a teammate's kick-in, award a free kick to the opposing team from where the goalkeeper first plays the ball. If that point is inside the goalkeeper area, take the free kick five yards outside the area in line with the offence.",
          "The ball should be stationary on or behind the line and opponents should give at least five yards where possible."
        ]
      },
      {
        "title": "Goalkeeper and Back-Pass Rules",
        "points": [
          "Goalkeepers may restart play by throwing the ball underarm or overarm.",
          "Backpasses to the goalkeeper are allowed.",
          "However, if a player receives the ball from their own goalkeeper, that player may not pass it straight back to the goalkeeper until another player has touched the ball.",
          "If this keeper-return offence happens, award a free kick to the opposing team five yards outside the goalkeeper area, in line with the point where the ball entered the area.",
          "Goalkeepers may save or stop the ball with their feet, but may not kick the ball out."
        ]
      },
      {
        "title": "Guest Players",
        "points": [
          "Teams may use a maximum of two guest players per match unless SIXFL has approved otherwise.",
          "Guest players may play a maximum of three matches for the same team during a season. After this point, the player must be registered as a permanent player for that team.",
          "Guest players must be declared before kick-off and must comply with any SIXFL approval requirement.",
          "If a guest player is permanently registered to another team in the same SIXFL league and season, SIXFL approval is required in advance; agreement between captains alone is not sufficient.",
          "An approved same-league guest appearance does not make the player permanently registered to the second team.",
          "Guest players may not participate in playoff or final matches unless registered with the team.",
          "Teams may not use guest players as substitutes during a match."
        ]
      },
      {
        "title": "Discipline, Cards and Dismissals",
        "points": [
          "Referees may use temporary suspensions, known as sin bins, for cautionable offences.",
          "A player shown a blue card is temporarily suspended from play for a period of at least three minutes, as determined by the referee.",
          "A second blue card in the same match results in permanent exclusion from the match.",
          "A red card results in immediate dismissal from the match.",
          "A dismissed player must promptly leave the playing area and any nearby area the referee reasonably directs them to leave.",
          "Refusal or unreasonable delay in complying with an instruction to leave may be treated as further misconduct and may result in the fixture being abandoned if the referee considers that the match cannot safely or properly continue.",
          "Serious disciplinary incidents may be reported to the relevant County FA."
        ]
      },
      {
        "title": "Abandoned Matches",
        "points": [
          "Where a referee abandons a match because of the conduct of one team, the referee's decision to abandon the match is final.",
          "The team whose conduct caused the abandonment is responsible for payment of both its own match fee and the opposing team's match fee.",
          "The result and league outcome of any abandoned fixture will be determined by SIXFL at its sole discretion, taking into account the circumstances available to it.",
          "SIXFL may allow the score at the time of abandonment to stand, award the match to either team, record a forfeit, leave the result pending while an administrative decision is made or take any other competition action it considers appropriate.",
          "Where SIXFL records a forfeit and does not expressly determine a different score, the administrative forfeit result will be 3–0.",
          "A result decision, fee decision and disciplinary decision are separate and may all apply to the same incident."
        ]
      }
    ]
  }
];

export const archivedPlayerLimitRulesV23Fingerprints = {
  "league-rules-2-3": "a74fa0498f585f11e1c009e893108d1f0cce22f070e0561b46d0f5323cadfee0",
  "match-rules-2-3": "9e65a126baba1115ddf20ea86a45c6b6674d051b033949bb1ce3eccfb7fe0d66"
};
