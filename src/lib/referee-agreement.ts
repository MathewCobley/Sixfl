export const REFEREE_AGREEMENT_VERSION = "1.0";
export const REFEREE_AGREEMENT_EFFECTIVE_DATE = "2 July 2026";

export type RefereeAgreementSection = {
  title: string;
  points: string[];
};

export const refereeAgreementSections: RefereeAgreementSection[] = [
  {
    title: "1. Independent contractor status",
    points: [
      "Referees providing services for SIXFL act as independent contractors and are not employees of SIXFL.",
      "Referees are responsible for their own tax, insurance and regulatory obligations.",
    ],
  },
  {
    title: "2. Duties and responsibilities",
    points: [
      "Officiate matches fairly and impartially in accordance with SIXFL rules.",
      "Manage player behaviour and take reasonable steps to keep matches safe and professionally run.",
    ],
  },
  {
    title: "3. Match administration",
    points: [
      "Record and submit match results, scores and disciplinary incidents using the SIXFL referee app and procedures.",
      "Record any material incident, abandonment, no-show or other issue clearly enough for SIXFL to review it.",
    ],
  },
  {
    title: "4. Payment",
    points: [
      "Referee fees and any cash-handling arrangements are shown or confirmed by SIXFL for the relevant league or match night.",
      "Referees are responsible for any tax obligations relating to payments received.",
    ],
  },
  {
    title: "5. Availability and attendance",
    points: [
      "Keep availability reasonably up to date and give as much notice as possible if you cannot attend an assigned night.",
      "SIXFL may appoint an alternative referee where necessary.",
    ],
  },
  {
    title: "6. Conduct and professional standards",
    points: [
      "Remain impartial and treat players, captains, spectators, venue staff and SIXFL staff with respect.",
      "Do not use your referee role to favour a team or player.",
    ],
  },
  {
    title: "7. Safety and liability",
    points: [
      "Football carries inherent risks and referees should carry out their role with reasonable care.",
      "Follow venue safety requirements and report serious safety concerns to SIXFL.",
    ],
  },
  {
    title: "8. Ending referee services",
    points: [
      "SIXFL may stop offering referee work where conduct, performance or reliability does not meet the standards expected.",
      "The agreement may be updated from time to time; the active version will be shown in the app.",
    ],
  },
];
