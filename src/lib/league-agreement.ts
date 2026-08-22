// ========================================
// File: src/lib/league-agreement.ts
// ========================================

export const LEAGUE_AGREEMENT_VERSION = "2.0";
export const LEAGUE_AGREEMENT_EFFECTIVE_DATE = "22 August 2026";
export const LEAGUE_AGREEMENT_NEXT_REVIEW = "22 August 2027";

export type LeagueAgreementSection = {
  title: string;
  points: string[];
};

export const leagueAgreementSections: LeagueAgreementSection[] = [
  {
    title: "1. Agreement Scope and Acceptance",
    points: [
      "This agreement applies to registered teams, captains and players participating in SIXFL leagues.",
      "By registering a team, joining a team or taking part in a SIXFL fixture, participants acknowledge the current League Rules, Match Rules and relevant competition requirements.",
      "The League Rules govern league administration, eligibility, discipline, payments, fixtures and competition outcomes. The Match Rules govern on-pitch play.",
    ],
  },
  {
    title: "2. Captain Authority and Responsibilities",
    points: [
      "The registered captain or organiser confirms that they are authorised to enter and communicate on behalf of the team.",
      "The captain is responsible for team communication, keeping squad details reasonably up to date, confirming fixtures, arranging payment of team fees and making sure players are aware of SIXFL rules and safety requirements.",
      "The captain remains responsible for the team's overall match fee even where individual player payment links or squad-payment tools are used.",
    ],
  },
  {
    title: "3. Player Eligibility and Safety",
    points: [
      "Players must be properly registered or used as permitted guest players in accordance with the Match Rules.",
      "Teams must not knowingly field an ineligible player or deliberately misrepresent player identity.",
      "Shin pads are mandatory. A referee may prevent a player from taking part until required safety equipment is being worn.",
    ],
  },
  {
    title: "4. Fixture Attendance, Confirmation and Cancellations",
    points: [
      "Teams are expected to attend scheduled fixtures and should confirm availability no later than 72 hours before kick-off or raise a genuine fixture issue with SIXFL before that deadline.",
      "A team that cannot fulfil a fixture must notify SIXFL directly as early as possible. An agreement only with the opposition does not cancel or rearrange the SIXFL fixture.",
      "A team cancelling less than 24 hours before kick-off remains liable for its own match fee unless SIXFL expressly agrees otherwise.",
      "A no-show or repeated avoidable late cancellation may result in a forfeit, disciplinary action or review of the team's place in the league.",
    ],
  },
  {
    title: "5. Match Fees and Admin Fees",
    points: [
      "The standard team match fee is £40 per fixture unless SIXFL has agreed a different fee for the team, fixture or competition.",
      "Match fees are due on match day unless SIXFL has agreed otherwise.",
      "A £10 late-confirmation admin fee may be applied where an avoidable missed 72-hour confirmation creates additional chasing, rearranging or administrative work.",
      "A £10 late-payment admin fee may be applied where a match fee remains unpaid more than seven days after the due date and SIXFL has to carry out additional payment-chasing or administration.",
      "SIXFL may send reminders or warnings where practical, but a warning is not a prerequisite to enforcement of a published payment or confirmation requirement.",
    ],
  },
  {
    title: "6. Conduct and Team Responsibility",
    points: [
      "Players, captains and spectators must behave respectfully towards referees, opponents, venue staff and SIXFL staff.",
      "Unsporting behaviour, abuse, threats, intimidation, violence, repeated dissent or serious disruption may result in warnings, conduct notices, suspension, fixture sanctions or removal from the league.",
      "SIXFL may review the team's continued participation where there is repeated non-payment, repeated late cancellation, persistent misconduct or another serious operational problem.",
    ],
  },
  {
    title: "7. Referee Authority and Abandoned Matches",
    points: [
      "Referee decisions regarding facts connected with play are final.",
      "A player shown a red card is dismissed and must promptly leave the playing area and any nearby area the referee reasonably directs them to leave.",
      "Where a referee abandons a match because of the conduct of one team, the referee's decision to abandon the fixture is final.",
      "The team whose conduct caused the abandonment is responsible for both teams' match fees. SIXFL determines the result and league outcome at its sole discretion in accordance with the League Rules.",
      "Where SIXFL records a forfeit and does not expressly determine a different score, the administrative forfeit result will be 3–0.",
    ],
  },
  {
    title: "8. Video Footage and Evidence",
    points: [
      "SIXFL may review footage for disciplinary, safeguarding, administrative and referee-development purposes.",
      "Footage may be incomplete, silent, obstructed or limited to a particular camera angle. The fact that an event or conversation is not visible on one recording does not by itself establish that it did not occur.",
      "SIXFL may take account of referee reports, footage, system records, contemporaneous communications, witness information and player or captain accounts.",
      "There is no automatic right to a video review or to have an ordinary on-field decision re-refereed retrospectively.",
    ],
  },
  {
    title: "9. League Decisions, Reviews and Appeals",
    points: [
      "SIXFL reserves the right to interpret and apply its rules and to make reasonable decisions in the interests of fairness, safety and the effective running of the league.",
      "There is no automatic right to an independent appeal, independent hearing or external review unless SIXFL has expressly created such a process for the competition concerned.",
      "SIXFL may reconsider an administrative or disciplinary decision where genuinely new and material evidence is provided or an obvious administrative error is identified.",
      "Any reconsideration is an internal SIXFL process unless SIXFL expressly states otherwise.",
      "Once a final decision has been communicated, SIXFL may close the matter and is not required to continue responding to repeated arguments which contain no genuinely new material evidence.",
    ],
  },
  {
    title: "10. Participation Risk",
    points: [
      "Football is a physical sport and participation carries a risk of injury.",
      "Players are responsible for making sure they are fit to participate and for following reasonable safety instructions from the referee, venue and SIXFL.",
      "Nothing in this agreement excludes any liability which cannot lawfully be excluded.",
    ],
  },
  {
    title: "11. Founding Team Kit Offer",
    points: [
      "Where SIXFL expressly allocates the Founding Team Kit Offer, the team receives seven complete personalised playing kits free of charge. There is no printing contribution.",
      "Additional complete kits cost £20 each unless SIXFL expressly confirms a different price.",
      "The captain is responsible for checking designs, sizes, names and numbers before submitting the order and is also bound by the separate Kit Offer Terms.",
    ],
  },
  {
    title: "12. Rule Changes and Version History",
    points: [
      "SIXFL may update its rules and agreements from time to time. Active documents will show a version number and effective date.",
      "Superseded versions are retained internally so that SIXFL can identify the wording which applied at an earlier date.",
      "Unless a change is required for safety or law, an incident will normally be considered under the version that was in force when it occurred.",
    ],
  },
];
