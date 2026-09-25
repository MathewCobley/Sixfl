import { ReportError, type ReportContent, type ReportSource, type ReportTableGroup } from "./types";

/** Points remain owned by the standings service, including double-points games.
 * These sentences are computed from its snapshots, never from wins * 3 or prose.
 */
export function verifiedTableStatements(source: ReportSource): string[] {
  const statements: string[] = [];
  const opponents = new Set(source.matches.flatMap(m => [
    JSON.stringify([m.teamA, m.teamB]), JSON.stringify([m.teamB, m.teamA]),
  ]));
  const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
  const points = (n: number) => `${n} ${n === 1 ? "point" : "points"}`;
  const add = (groups: ReportTableGroup[] | undefined, after: boolean) => {
    for (const group of groups ?? []) {
      const rows = group.rows;
      // Fail closed for malformed/ambiguous snapshots; never repair/re-sort them.
      if (!rows.length || new Set(rows.map(r => r.team)).size !== rows.length || rows.some((r, i) =>
        !r.team.trim() || r.position !== i + 1 || !Number.isSafeInteger(r.points) ||
        !Number.isSafeInteger(r.goalDifference) || !Number.isSafeInteger(r.played) || r.played < 0 ||
        (i > 0 && (rows[i - 1].points < r.points ||
          (rows[i - 1].points === r.points && rows[i - 1].goalDifference < r.goalDifference)))
      )) continue;
      const when = after ? "finished the night" : "started the night";
      const division = group.division ? ` in ${group.division}` : "";
      for (const row of rows) {
        statements.push(`${row.team} ${when} in ${ordinal(row.position)} place${division} on ${points(row.points)}.`);
      }
      // Only compare teams within the same snapshot and division.
      for (let i = 0; i < rows.length; i++) {
        const a = rows[i];
        for (let j = i + 1; j < rows.length; j++) {
          const b = rows[j];
          // Bound prompt size: leader gaps, adjacent teams and this night's opponents.
          if (i !== 0 && j !== i + 1 && !opponents.has(JSON.stringify([a.team, b.team]))) continue;
          const gap = a.points - b.points;
          if (!Number.isSafeInteger(gap)) continue;
          if (gap > 0) {
            statements.push(`${a.team} ${when} ${points(gap)} ahead of ${b.team}${division}.`);
            statements.push(`${b.team} ${when} ${points(gap)} behind ${a.team}${division}.`);
          } else if (gap === 0) {
            statements.push(`${a.team} and ${b.team} ${when} level on ${points(a.points)}${division}.`);
          }
        }
      }
      const [leader, second] = rows;
      if (!second || !rows.some(r => r.played > 0)) continue;
      const gap = leader.points - second.points;
      if (gap > 0 && Number.isSafeInteger(gap)) {
        statements.push(`${leader.team} ${when} top${division}, ${points(gap)} ahead of ${second.team}.`);
      } else if (gap === 0 && leader.goalDifference > second.goalDifference) {
        statements.push(`${leader.team} ${when} top${division}, ahead of ${second.team} on goal difference with both on ${points(leader.points)}.`);
      }
    }
  };
  add(source.standingsBeforeNight, false);
  if (source.pendingFixtures === 0 && source.omittedFixtures === 0) add(source.standingsAfterNight, true);
  return [...new Set(statements)];
}

const normalise = (text: string) => text.normalize("NFKC").replace(/[’‘]/g, "'").replace(/[\s\u200b\u200c\u200d\ufeff]+/g, " ").trim();
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// A deliberately conservative editorial gate, not a general semantic fact checker.
// Numerical standings and tiebreak prose must use an entire computed sentence.
const protectedClaim = /\b(?:points?|pts|GD)\b|\bgoal[\s–—-]+(?:difference|diff)\b|\b(?:joint[\s–—-]+(?:top|leaders?)|(?:level|tied)[\s–—-]+at[\s–—-]+the[\s–—-]+top)\b|\bon goals scored\b/i;

export function assertVerifiedTableClaims(content: ReportContent, source: ReportSource): void {
  const approved = verifiedTableStatements(source).map(normalise).sort((a, b) => b.length - a.length);
  // Names are literal data, not claims (e.g. Three Points FC or Joe Points).
  const names = [...new Set([
    source.leagueName,
    ...source.matches.flatMap(m => [m.teamA, m.teamB, ...m.scorers.map(s => s.name), ...m.playersOfMatch.map(p => p.name)]),
    ...[...(source.standingsBeforeNight ?? []), ...(source.standingsAfterNight ?? [])].flatMap(g => [g.division ?? "", ...g.rows.map(r => r.team)]),
  ].map(normalise).filter(Boolean))].sort((a, b) => b.length - a.length);
  const fields = [content.title, content.introduction, ...content.matches.map(m => m.paragraph), content.closing];
  for (const field of fields) {
    let text = normalise(field);
    for (const sentence of approved) {
      // Whole-sentence boundaries prevent a correct sentence embedded in a
      // contradictory claim ("It is not true that AHC finished...") passing.
      text = text.replace(new RegExp(`(^|[.!?] )${escape(sentence)}(?= |$)`, "g"), "$1VERIFIED.");
    }
    for (const name of names) {
      text = text.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}])`, "gu"), "TEAM_OR_PLAYER");
    }
    if (protectedClaim.test(text)) {
      throw new ReportError("This report contains an unverified points or goal-difference claim. Regenerate the report or remove that claim before publishing.", 422);
    }
  }
}
