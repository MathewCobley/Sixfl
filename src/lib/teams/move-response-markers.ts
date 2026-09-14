export const TEAM_MOVE_RESPONSE_BLOCK = [
  "SIXFL_TEAM_MOVE_OPTIONS_START",
  "YES — our team can move",
  "NO — our team cannot move",
  "SIXFL_TEAM_MOVE_OPTIONS_END",
].join("\n");

export function hasTeamMoveResponseBlock(body: string) {
  return body.includes("SIXFL_TEAM_MOVE_OPTIONS_START") && body.includes("SIXFL_TEAM_MOVE_OPTIONS_END");
}

export function renderTeamMoveResponseBlock(body: string, input: { yesUrl: string; noUrl: string }) {
  const start = body.indexOf("SIXFL_TEAM_MOVE_OPTIONS_START");
  const endMarker = "SIXFL_TEAM_MOVE_OPTIONS_END";
  const end = body.indexOf(endMarker, start);
  if (start < 0 || end < 0) return body;
  const replacement = [
    "SIXFL_POLL_OPTIONS_START",
    `YES — our team can move: ${input.yesUrl}`,
    `NO — our team cannot move: ${input.noUrl}`,
    "SIXFL_POLL_OPTIONS_END",
  ].join("\n");
  return `${body.slice(0, start)}${replacement}${body.slice(end + endMarker.length)}`;
}
