import { describeResultOverturn, RESULT_OVERTURN_REASONS, type OverturnedScoreSummary } from "./result-score";

/** Public result fields only. Never pass or spread an admin decision into an email. */
export type OverturnEmailFacts = OverturnedScoreSummary & {
  homeTeamName: string;
  awayTeamName: string;
  kickoffAt: Date;
};

export function buildResultOverturnEmail(facts: OverturnEmailFacts) {
  if (!RESULT_OVERTURN_REASONS.some(item => item.value === facts.reasonCode)) {
    throw new Error("Unknown result decision reason.");
  }
  const result = describeResultOverturn(facts, facts.homeTeamName, facts.awayTeamName);
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London",
  }).format(facts.kickoffAt);
  const fixture = `${facts.homeTeamName} v ${facts.awayTeamName}`.replace(/\s+/g, " ").trim();
  return {
    subject: `SIXFL result update — ${fixture}`,
    body: [
      "Hi,", "",
      `Following SIXFL's review, the result of ${fixture} on ${date} has been overturned.`, "",
      `Original on-pitch result: ${result.original}`,
      `Official awarded result: ${result.awarded}`, "",
      `${result.winner} have been awarded a 3–0 default win for a rule breach.`,
      `Reason: ${result.reason}.`, "",
      "The league table now uses the awarded result. The original on-pitch score remains on record.", "",
      "This update is being sent to both teams for clarity.", "",
      "Thanks,", "SIXFL",
    ].join("\n"),
  };
}
