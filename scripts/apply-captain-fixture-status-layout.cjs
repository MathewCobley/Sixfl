const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(
  process.cwd(),
  "src/app/captain/team/[teamid]/page.tsx",
);
let source = fs.readFileSync(pagePath, "utf8");

const marker = 'data-captain-fixture-summary="true"';

if (!source.includes(marker)) {
  const before = [
    '                <div key={fixture.id} className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">',
    '                  <div><div className="flex flex-wrap items-center gap-2"><div className="text-base font-semibold text-white">{getFixtureLabel({ homeTeamName: fixture.homeTeam.name, awayTeamName: fixture.awayTeam.name })}</div>{index === 0 ? <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-100">Next up</span> : null}</div><div className="mt-1 text-sm text-white/60">{formatDateTime(fixture.kickoffAt)}</div></div>',
    '                  <div className="text-sm sm:text-right"><div className="text-white/65">{fixture.venue?.name ?? currentLeague?.venueName ?? team.league?.venueName ?? "Venue TBC"}</div><div className="mt-2"><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getToneClasses(status.tone)}`}>{status.label}</span></div></div>',
    '                </div>',
  ].join("\n");

  const after = [
    '                <div',
    '                  key={fixture.id}',
    '                  data-captain-fixture-summary="true"',
    '                  className="px-6 py-5"',
    '                >',
    '                  <div className="flex flex-wrap items-center gap-2">',
    '                    <div className="min-w-0 text-base font-semibold text-white">',
    '                      {getFixtureLabel({',
    '                        homeTeamName: fixture.homeTeam.name,',
    '                        awayTeamName: fixture.awayTeam.name,',
    '                      })}',
    '                    </div>',
    '                    {index === 0 ? (',
    '                      <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-100">',
    '                        Next up',
    '                      </span>',
    '                    ) : null}',
    '                    <span',
    '                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getToneClasses(status.tone)}`}',
    '                    >',
    '                      {status.label}',
    '                    </span>',
    '                  </div>',
    '',
    '                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/60">',
    '                    <span>{formatDateTime(fixture.kickoffAt)}</span>',
    '                    <span aria-hidden="true" className="text-white/25">·</span>',
    '                    <span>',
    '                      {fixture.venue?.name ??',
    '                        currentLeague?.venueName ??',
    '                        team.league?.venueName ??',
    '                        "Venue TBC"}',
    '                    </span>',
    '                  </div>',
    '                </div>',
  ].join("\n");

  if (!source.includes(before)) {
    throw new Error(
      "Expected captain fixture summary row was not found. The overview layout may have changed.",
    );
  }

  source = source.replace(before, after);
  fs.writeFileSync(pagePath, source, "utf8");
}

if (
  !source.includes(marker) ||
  source.includes(
    'className="text-sm sm:text-right"><div className="text-white/65"',
  )
) {
  throw new Error("Captain fixture confirmation status is still using the bunched side column.");
}

require("./apply-captain-latest-result-outcomes.cjs");

console.log(
  "Captain fixture status now sits beside the fixture name, with the date and venue on a full-width line below.",
);
