const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(
  process.cwd(),
  "src/app/captain/team/[teamid]/page.tsx",
);
let source = fs.readFileSync(pagePath, "utf8");

const marker = 'data-captain-result-outcome="true"';
const originalMarker = 'data-original-played-result="true"';

const resultSelectBefore = `            id: true,
            homeScore: true,
            awayScore: true,
            isDisputed: true,
            disputes:`;
const resultSelectAfter = `            id: true,
            homeScore: true,
            awayScore: true,
            isDisputed: true,
            overturn: {
              select: {
                originalHomeScore: true,
                originalAwayScore: true,
              },
            },
            disputes:`;

if (!source.includes("originalHomeScore: true")) {
  if (!source.includes(resultSelectBefore)) {
    throw new Error(
      "Expected captain recent-result select was not found. The overview may have changed.",
    );
  }
  source = source.replace(resultSelectBefore, resultSelectAfter);
}

if (!source.includes(marker)) {
  const before = `              const goalsAgainst = isHome ? fixture.result!.awayScore : fixture.result!.homeScore;
              return (
                <div key={fixture.id} className="px-6 py-5"><div className="flex items-center justify-between gap-4"><div><div className="text-base font-semibold text-white">{opponent}</div><div className="mt-1 text-sm text-white/60">{formatDateTime(fixture.kickoffAt)}</div></div><div className="text-right"><div className="text-lg font-semibold text-white">{goalsFor} - {goalsAgainst}</div></div></div></div>
              );`;

  const after = `              const goalsAgainst = isHome ? fixture.result!.awayScore : fixture.result!.homeScore;
              const outcome =
                goalsFor > goalsAgainst
                  ? {
                      label: "WIN",
                      verb: "Won",
                      tone: "border-emerald-400/30 bg-emerald-500/15 text-emerald-100",
                    }
                  : goalsFor < goalsAgainst
                    ? {
                        label: "LOSS",
                        verb: "Lost",
                        tone: "border-red-400/30 bg-red-500/15 text-red-100",
                      }
                    : {
                        label: "DRAW",
                        verb: "Drew",
                        tone: "border-amber-400/30 bg-amber-500/15 text-amber-100",
                      };
              const originalGoalsFor = fixture.result!.overturn
                ? isHome
                  ? fixture.result!.overturn.originalHomeScore
                  : fixture.result!.overturn.originalAwayScore
                : null;
              const originalGoalsAgainst = fixture.result!.overturn
                ? isHome
                  ? fixture.result!.overturn.originalAwayScore
                  : fixture.result!.overturn.originalHomeScore
                : null;
              const originalVerb =
                originalGoalsFor == null || originalGoalsAgainst == null
                  ? null
                  : originalGoalsFor > originalGoalsAgainst
                    ? "Won"
                    : originalGoalsFor < originalGoalsAgainst
                      ? "Lost"
                      : "Drew";
              return (
                <div
                  key={fixture.id}
                  data-captain-result-outcome="true"
                  className="px-6 py-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
                        Opponent
                      </div>
                      <div className="mt-1 text-base font-semibold text-white">
                        {opponent}
                      </div>
                      <div className="mt-1 text-sm text-white/60">
                        {formatDateTime(fixture.kickoffAt)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span
                        className={\`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black tracking-[0.08em] \${outcome.tone}\`}
                      >
                        {outcome.label}
                      </span>
                      <div className="mt-2 text-lg font-black text-white">
                        {outcome.verb} {goalsFor} - {goalsAgainst}
                      </div>
                      {originalVerb ? (
                        <div
                          data-original-played-result="true"
                          className="mt-2 text-sm font-semibold text-amber-100/90"
                        >
                          Original played result: {originalVerb} {originalGoalsFor} - {originalGoalsAgainst}
                        </div>
                      ) : null}
                      <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-white/35">
                        Your team’s score first
                      </div>
                    </div>
                  </div>
                </div>
              );`;

  if (!source.includes(before)) {
    throw new Error(
      "Expected ambiguous captain latest-score row was not found. The overview may have changed.",
    );
  }

  source = source.replace(before, after);
} else if (!source.includes(originalMarker)) {
  const oldScoreBlock = `                      <div className="mt-2 text-lg font-black text-white">
                        {outcome.verb} {goalsFor} - {goalsAgainst}
                      </div>
                      <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-white/35">`;
  const newScoreBlock = `                      <div className="mt-2 text-lg font-black text-white">
                        {outcome.verb} {goalsFor} - {goalsAgainst}
                      </div>
                      {fixture.result!.overturn ? (
                        <div
                          data-original-played-result="true"
                          className="mt-2 text-sm font-semibold text-amber-100/90"
                        >
                          Original played result: {isHome
                            ? fixture.result!.overturn.originalHomeScore > fixture.result!.overturn.originalAwayScore
                              ? "Won"
                              : fixture.result!.overturn.originalHomeScore < fixture.result!.overturn.originalAwayScore
                                ? "Lost"
                                : "Drew"
                            : fixture.result!.overturn.originalAwayScore > fixture.result!.overturn.originalHomeScore
                              ? "Won"
                              : fixture.result!.overturn.originalAwayScore < fixture.result!.overturn.originalHomeScore
                                ? "Lost"
                                : "Drew"} {isHome ? fixture.result!.overturn.originalHomeScore : fixture.result!.overturn.originalAwayScore} - {isHome ? fixture.result!.overturn.originalAwayScore : fixture.result!.overturn.originalHomeScore}
                        </div>
                      ) : null}
                      <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-white/35">`;

  if (!source.includes(oldScoreBlock)) {
    throw new Error(
      "Existing captain outcome row was found but its score block could not be upgraded.",
    );
  }
  source = source.replace(oldScoreBlock, newScoreBlock);
}

fs.writeFileSync(pagePath, source, "utf8");

if (
  !source.includes(marker) ||
  !source.includes(originalMarker) ||
  !source.includes("Original played result:") ||
  !source.includes("originalHomeScore: true") ||
  !source.includes("originalAwayScore: true") ||
  !source.includes("Your team’s score first") ||
  !source.includes('label: "WIN"') ||
  !source.includes('label: "LOSS"') ||
  !source.includes('label: "DRAW"')
) {
  throw new Error(
    "Captain latest results must show team-perspective outcomes and preserve any original played result.",
  );
}

console.log(
  "Captain latest scores now show the awarded result plus the original played result when a result has been overturned.",
);
