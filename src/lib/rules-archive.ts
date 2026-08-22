// ========================================
// File: src/lib/rules-archive.ts
// ========================================

export type ArchivedRuleDocument = {
  id: string;
  document: string;
  version: string;
  effectiveDate: string;
  supersededDate: string;
  status: "Superseded";
  sections: Array<{
    title: string;
    points: string[];
  }>;
};

export const archivedRuleDocuments: ArchivedRuleDocument[] = [
  {
    id: "league-rules-1-4",
    document: "League Rules",
    version: "1.4",
    effectiveDate: "12 August 2026",
    supersededDate: "22 August 2026",
    status: "Superseded",
    sections: [
      {
        title: "1. Team Registration",
        points: [
          "All teams must complete the SIXFL registration process and provide accurate captain and player details before participating in league matches.",
        ],
      },
      {
        title: "2. Match Format",
        points: [
          "Matches are played as 6-a-side fixtures in accordance with SIXFL competition regulations. Specific venue rules, kick-off times and fixture details will be communicated by the league.",
        ],
      },
      {
        title: "3. Player Eligibility",
        points: [
          "Only properly registered players may represent a team in league fixtures. Teams may not field ineligible players or deliberately misrepresent player identity.",
        ],
      },
      {
        title: "4. Squad Size and Matchday Player Limit",
        points: [
          "There is no maximum squad size. Teams may register as many players to their squad as they wish. However, a maximum of nine players may take part in any single fixture: six players on the pitch and up to three rolling substitutes. All players who participate in the fixture, including guest players, count towards this nine-player limit. Exceptions require prior approval from SIXFL.",
        ],
      },
      {
        title: "5. Respect and Conduct",
        points: [
          "Players, captains and spectators must behave respectfully towards referees, opponents and league staff. Abuse, threatening behaviour and serious misconduct may result in suspension or removal from the league.",
        ],
      },
      {
        title: "6. Results and League Table",
        points: [
          "Match results are recorded by the referee or league administrator and used to update the standings. SIXFL may correct administrative recording errors or amend results where an ineligible player, serious misconduct, cheating or another significant rule breach is established. Ordinary refereeing decisions made during play will not normally be reconsidered retrospectively.",
        ],
      },
      {
        title: "7. Discipline",
        points: [
          "SIXFL may take disciplinary action in response to misconduct, dangerous play, abusive language, repeated non-attendance or any behaviour that brings the league into disrepute.",
        ],
      },
      {
        title: "8. Abandoned Matches",
        points: [
          "Where a referee abandons a match because of the conduct of one team, the referee's decision to abandon the match is final. The team whose conduct caused the abandonment will be responsible for payment of both its own match fee and the opposing team's match fee. The result and league outcome of any abandoned fixture will be determined by SIXFL at its sole discretion, taking into account the circumstances of the abandonment. This may include allowing the score at the time of abandonment to stand, awarding the match to either team, recording a forfeit or taking any other action SIXFL considers appropriate.",
        ],
      },
      {
        title: "9. Fixtures and Cancellations",
        points: [
          "Fixtures are scheduled by SIXFL and may be changed where necessary due to venue issues, weather, operational requirements or exceptional circumstances.",
        ],
      },
      {
        title: "10. Video Footage and Post-Match Review",
        points: [
          "Referee decisions regarding facts connected with play are final. Video footage may be reviewed for disciplinary, safeguarding, administrative and referee-development purposes, including serious misconduct, violence, abuse, mistaken identity, suspected cheating, use of an ineligible player or an incorrectly entered score. Unless SIXFL has announced a formal competition-specific video-review process in advance, footage will not normally be used to re-referee a match, overturn an on-field decision or change a result arising from that decision. There is no automatic right to a video review, and footage may not be available or of equal quality for every match.",
        ],
      },
      {
        title: "11. League Decisions",
        points: [
          "SIXFL reserves the right to interpret and apply league rules in the interests of fairness, safety and good league management. League decisions are final unless otherwise stated.",
        ],
      },
    ],
  },
  {
    id: "match-rules-1-4",
    document: "Match Rules",
    version: "1.4",
    effectiveDate: "12 August 2026",
    supersededDate: "22 August 2026",
    status: "Superseded",
    sections: [
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
      {
        title: "Abandoned Matches",
        points: [
          "Where a referee abandons a match because of the conduct of one team, the referee's decision to abandon the match is final.",
          "The team whose conduct caused the abandonment is responsible for payment of both its own match fee and the opposing team's match fee.",
          "The result and league outcome of any abandoned fixture will be determined by SIXFL at its sole discretion, taking into account the circumstances of the abandonment.",
          "SIXFL may allow the score at the time of abandonment to stand, award the match to either team, record a forfeit or take any other action it considers appropriate.",
        ],
      },
    ],
  },
  {
    id: "league-agreement-1-2",
    document: "League Participation Agreement",
    version: "1.2",
    effectiveDate: "3 August 2026",
    supersededDate: "22 August 2026",
    status: "Superseded",
    sections: [
      {
        title: "1. Team Registration",
        points: [
          "Teams register for a SIXFL league through a designated team captain or organiser. The captain confirms they are authorised to enter the team into the league and communicate with SIXFL on behalf of the team.",
        ],
      },
      {
        title: "2. Captain Responsibilities",
        points: [
          "The team captain acts as the primary contact for the league. The captain is responsible for ensuring team members are aware of fixtures, league rules and conduct expectations.",
        ],
      },
      {
        title: "3. Match Attendance",
        points: [
          "Teams are expected to attend scheduled fixtures. If a team cannot attend a match, they should notify the league as early as possible. Failure to attend may result in the match being recorded as a forfeit.",
        ],
      },
      {
        title: "4. Player Conduct",
        points: [
          "Players are expected to behave respectfully toward opponents, referees and league organisers. Unsporting or abusive behaviour may result in disciplinary action or removal from the league.",
        ],
      },
      {
        title: "5. Referee Authority",
        points: [
          "All matches are officiated by referees appointed by the league. Decisions made by the referee during the match are final.",
        ],
      },
      {
        title: "6. Fixtures and Scheduling",
        points: [
          "Fixtures are organised and communicated by SIXFL. Match schedules may occasionally change due to weather, venue availability or other operational factors.",
        ],
      },
      {
        title: "7. League Management",
        points: [
          "SIXFL reserves the right to make reasonable decisions in the interest of fair play, safety and the smooth running of the league.",
        ],
      },
      {
        title: "8. Participation Risk",
        points: [
          "Football is a physical sport and participation carries a risk of injury. Players take part at their own risk and are responsible for ensuring they are fit to play.",
        ],
      },
      {
        title: "9. Founding Team Kit Offer",
        points: [
          "Where SIXFL expressly allocates the Founding Team Kit Offer, the team receives seven complete personalised playing kits free of charge. There is no printing contribution. Additional complete kits cost £20 each. The captain is responsible for checking all designs, sizes, names and numbers before submission.",
        ],
      },
      {
        title: "10. Agreement Acceptance",
        points: [
          "By registering a team, joining a team or participating in a SIXFL match, players acknowledge and agree to these participation terms. A captain who submits a Founding Team Kit Offer order also confirms acceptance of the separate Kit Offer Terms.",
        ],
      },
    ],
  },
];
