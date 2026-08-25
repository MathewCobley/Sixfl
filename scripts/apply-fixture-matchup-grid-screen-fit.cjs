const fs = require("node:fs");
const path = require("node:path");

const target = path.join(
  process.cwd(),
  "src/components/admin/fixtures/FixtureMatchupGrid.tsx",
);

let source = fs.readFileSync(target, "utf8");

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Fixture matchup grid screen-fit patch could not find ${label}.`);
  }
  source = source.replace(before, after);
}

replaceRequired(
  `<div className="mt-6 overflow-x-auto rounded-3xl border border-white/10 bg-black/20">\n              <table className="min-w-max border-collapse text-left text-xs">`,
  `<div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-black/20">\n              <table className="w-full table-fixed border-collapse text-left text-[10px] xl:text-xs">`,
  "scrolling table wrapper",
);

replaceRequired(
  `<th className="sticky left-0 z-20 min-w-[180px] border-r border-white/10 bg-[#07120f] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">Team</th>`,
  `<th\n                      className="sticky left-0 z-20 border-r border-white/10 bg-[#07120f] px-2 py-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-white/45 xl:px-3 xl:text-[10px]"\n                      style={{ width: data.teams.length >= 14 ? "10%" : data.teams.length >= 10 ? "12%" : "16%" }}\n                    >\n                      Team\n                    </th>`,
  "team column header",
);

replaceRequired(
  `{data.teams.map((team) => <th key={team.id} className="min-w-[120px] max-w-[150px] border-r border-white/10 px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50"><span className="block truncate" title={team.name}>{team.name}</span></th>)}`,
  `{data.teams.map((team) => (\n                      <th\n                        key={team.id}\n                        className="min-w-0 border-r border-white/10 px-1 py-2 text-[8px] font-semibold uppercase leading-tight tracking-[0.06em] text-white/50 xl:px-1.5 xl:text-[9px]"\n                      >\n                        <span className="block truncate" title={team.name}>{team.name}</span>\n                      </th>\n                    ))}`,
  "opponent column headers",
);

replaceRequired(
  `<th className="sticky left-0 z-10 min-w-[180px] border-r border-white/10 bg-[#07120f] px-4 py-3 text-sm font-semibold text-white">{row.teamName}</th>`,
  `<th\n                        className="sticky left-0 z-10 min-w-0 truncate border-r border-white/10 bg-[#07120f] px-2 py-2 text-[10px] font-semibold leading-tight text-white xl:px-3 xl:text-xs"\n                        title={row.teamName}\n                      >\n                        {row.teamName}\n                      </th>`,
  "team row header",
);

replaceRequired(
  `<td key={cell.opponentId} className="border-r border-white/10 p-2 align-top">\n                          <div className={\`min-h-[72px] rounded-2xl border px-3 py-2 \${getCellTone(cell)}\`}>\n                            <div className="text-sm font-semibold">{cell.label}</div>\n                            {!cell.isSelf ? <div className="mt-1 text-[11px] opacity-75">{getCellHelper(cell)}</div> : null}\n                          </div>\n                        </td>`,
  `<td key={cell.opponentId} className="min-w-0 border-r border-white/10 p-1 align-top">\n                          <div className={\`min-h-[54px] overflow-hidden rounded-xl border px-1.5 py-1.5 xl:min-h-[60px] xl:px-2 \${getCellTone(cell)}\`}>\n                            <div className="truncate text-[10px] font-semibold leading-tight xl:text-xs">{cell.label}</div>\n                            {!cell.isSelf ? (\n                              <div className="mt-1 line-clamp-2 text-[8px] leading-tight opacity-75 xl:text-[9px]">{getCellHelper(cell)}</div>\n                            ) : null}\n                          </div>\n                        </td>`,
  "venue-neutral matchup cells",
);

if (
  !source.includes('className="w-full table-fixed border-collapse') ||
  source.includes('className="min-w-max border-collapse text-left text-xs"') ||
  source.includes('mt-6 overflow-x-auto rounded-3xl')
) {
  throw new Error("Fixture matchup grid screen-fit patch did not apply cleanly.");
}

fs.writeFileSync(target, source, "utf8");
console.log("Fixture matchup grid now fits the available screen width without horizontal scrolling.");
