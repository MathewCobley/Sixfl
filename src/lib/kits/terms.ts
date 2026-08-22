export const KIT_OFFER_TERMS_VERSION = "2.2";
export const KIT_OFFER_TERMS_EFFECTIVE_DATE = "22 August 2026";
export const KIT_OFFER_TERMS_NEXT_REVIEW = "22 August 2027";

export type KitOfferTermSection = {
  title: string;
  points: string[];
};

export const kitOfferTermsSections: KitOfferTermSection[] = [
  {
    title: "1. Who can receive the offer",
    points: [
      "The Founding Team Kit Offer is available only to teams expressly selected by SIXFL for a participating launch league. Registering interest does not guarantee eligibility.",
      "The team must complete registration and secure its league place. The free kit entitlement becomes claimable only after the team has played three SIXFL league fixtures and the corresponding fixture charges for those three matches have been paid in full.",
    ],
  },
  {
    title: "2. Claim deadline",
    points: [
      "Once the team becomes eligible after its third paid match, the free kit order must be claimed and submitted within 60 days. The 60-day period starts on the date the third qualifying fixture charge is paid in full.",
      "If the team does not submit its free kit order within that period, the unclaimed offer expires unless SIXFL agrees otherwise in writing.",
    ],
  },
  {
    title: "3. What is included",
    points: [
      "The offer contains seven complete playing kits: seven shirts, seven pairs of shorts and seven pairs of socks. One design is selected for the whole team, subject to supplier availability.",
    ],
  },
  {
    title: "4. Price",
    points: [
      "The seven included kits are supplied free of charge. Personalised names and shirt numbers are included and there is no compulsory printing contribution.",
    ],
  },
  {
    title: "5. Personalisation",
    points: [
      "Every shirt must have a unique squad number from 1 to 99. A player name may also be added but is optional. The submitted personalisation is included in the free seven-kit allocation.",
    ],
  },
  {
    title: "6. Captain approval and acceptance",
    points: [
      "The captain is responsible for checking the selected design, all kit sizes, names and shirt numbers before submitting the order.",
      "Submitting the order confirms that the supplied details are correct and that the captain accepts the version of these terms displayed at the time of submission.",
      "SIXFL records the accepted terms version, acceptance time and submitting account for new kit submissions made after version tracking was introduced.",
    ],
  },
  {
    title: "7. Changes and personalised items",
    points: [
      "Changes cannot normally be made once personalised production has started. SIXFL is not responsible for errors supplied or approved by the captain.",
      "This does not affect rights relating to items that are faulty, incorrectly produced or not as described.",
    ],
  },
  {
    title: "8. Availability and alternatives",
    points: [
      "Designs, colours and sizes remain subject to supplier availability. If a selected design becomes unavailable, SIXFL will offer a reasonable alternative for the captain to approve before ordering.",
    ],
  },
  {
    title: "9. Additional and replacement items",
    points: [
      "The free offer covers seven complete kits. Additional complete kits cost £20 each unless SIXFL expressly confirms a different price before purchase.",
      "Later replacements and changes requested after the original order may be charged separately at the price confirmed by SIXFL.",
    ],
  },
  {
    title: "10. Withdrawal, suspension, removal, transfer and cash value",
    points: [
      "The free offer has no cash alternative and cannot be transferred to another team without SIXFL approval.",
      "SIXFL may withdraw an unplaced free kit allocation where a team does not secure its league place, does not complete and pay for the three qualifying matches, misses the 60-day claim deadline, withdraws from the league, is suspended or removed from the competition, or provides incomplete order details.",
      "Withdrawal, suspension or removal does not entitle a team to the cash value of an unplaced free allocation.",
    ],
  },
  {
    title: "11. Paid additional kits if a team leaves or is removed",
    points: [
      "Paid additional kits are treated separately from the team's right to participate in the league.",
      "If paid additional kits have not been placed with the supplier or entered personalised production when the team withdraws, is suspended or is removed, SIXFL may cancel those unplaced paid items and will refund the amount paid for the cancelled items.",
      "Where paid personalised kits have already been placed with the supplier or entered production, the order will normally continue and the items will be supplied to the purchaser. A team's withdrawal, suspension or removal from a SIXFL competition does not by itself cancel an already-placed paid personalised kit order.",
      "Kit payments are accounted for separately from match fees, disciplinary charges and other league balances unless SIXFL and the purchaser expressly agree otherwise.",
    ],
  },
  {
    title: "12. Production and delivery",
    points: [
      "Any production or delivery date is an estimate and may be affected by supplier availability, personalisation or shipping. SIXFL will update the captain if there is a material delay.",
    ],
  },
];

export const archivedKitOfferTermsDocuments = [
  {
    id: "founding-team-kit-terms-2-1",
    document: "Founding Team Kit Offer Terms",
    version: "2.1",
    effectiveDate: "11 August 2026",
    supersededDate: "22 August 2026",
    status: "Superseded" as const,
    sections: [
      { title: "1. Who can receive the offer", points: ["The Founding Team Kit Offer is available only to teams expressly selected by SIXFL for a participating launch league. Registering interest does not guarantee eligibility. The team must complete registration and secure its league place. The free kit entitlement becomes claimable only after the team has played three SIXFL league fixtures and the corresponding fixture charges for those three matches have been paid in full."] },
      { title: "2. Claim deadline", points: ["Once the team becomes eligible after its third paid match, the free kit order must be claimed and submitted within 60 days. The 60-day period starts on the date the third qualifying fixture charge is paid in full. If the team does not submit its free kit order within that period, the unclaimed offer expires unless SIXFL agrees otherwise in writing."] },
      { title: "3. What is included", points: ["The offer contains seven complete playing kits: seven shirts, seven pairs of shorts and seven pairs of socks. One design is selected for the whole team, subject to supplier availability."] },
      { title: "4. Price", points: ["The seven included kits are supplied free of charge. Personalised names and shirt numbers are included and there is no compulsory printing contribution."] },
      { title: "5. Personalisation", points: ["Every shirt must have a unique squad number from 1 to 99. A player name may also be added but is optional. The submitted personalisation is included in the free seven-kit allocation."] },
      { title: "6. Captain approval", points: ["The captain is responsible for checking the selected design, all kit sizes, names and shirt numbers before submitting the order. Submitting confirms that the supplied details are correct and that the captain accepts these terms."] },
      { title: "7. Changes and personalised items", points: ["Changes cannot normally be made once personalised production has started. SIXFL is not responsible for errors supplied or approved by the captain. This does not affect rights relating to items that are faulty, incorrectly produced or not as described."] },
      { title: "8. Availability and alternatives", points: ["Designs, colours and sizes remain subject to supplier availability. If a selected design becomes unavailable, SIXFL will offer a reasonable alternative for the captain to approve before ordering."] },
      { title: "9. Additional and replacement items", points: ["The free offer covers seven complete kits. Additional complete kits cost £20 each. Later replacements and changes requested after the original order may be charged separately at the price confirmed by SIXFL."] },
      { title: "10. Withdrawal, expiry, transfer and cash value", points: ["The offer has no cash alternative and cannot be transferred to another team without SIXFL approval. SIXFL may withdraw an unplaced allocation where a team does not secure its league place, does not complete and pay for the three qualifying matches, misses the 60-day claim deadline, withdraws from the league or provides incomplete order details."] },
      { title: "11. Production and delivery", points: ["Any production or delivery date is an estimate and may be affected by supplier availability, personalisation or shipping. SIXFL will update the captain if there is a material delay."] },
    ],
  },
];
