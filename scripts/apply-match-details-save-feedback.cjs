const fs = require("node:fs");

const file = "src/app/captain/team/[teamid]/results/page.tsx";
let source = fs.readFileSync(file, "utf8");

function replaceOnce(from, to, label) {
  if (source.includes(to)) return;
  const index = source.indexOf(from);
  if (index === -1) {
    throw new Error(`[match-details-save-feedback] Missing anchor: ${label}`);
  }
  source = source.slice(0, index) + to + source.slice(index + from.length);
}

replaceOnce(
  '  saved?: string;\n  error?: string;',
  '  saved?: string;\n  savedResultId?: string;\n  error?: string;',
  "saved result search param",
);

replaceOnce(
  '  redirect(`/captain/team/${teamid}/results?saved=1`);',
  '  redirect(`/captain/team/${teamid}/results?saved=1&savedResultId=${encodeURIComponent(resultId)}#match-${encodeURIComponent(resultId)}`);',
  "save redirect with result anchor",
);

replaceOnce(
  '            <section\n              key={row.fixture.id}\n              className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-[0_18px_70px_rgba(0,0,0,0.22)]"',
  '            <section\n              key={row.fixture.id}\n              id={`match-${row.fixture.result!.id}`}\n              className="scroll-mt-6 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-[0_18px_70px_rgba(0,0,0,0.22)]"',
  "match result anchor",
);

replaceOnce(
  '                  <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-emerald-400/15 bg-emerald-500/10 p-4 text-sm text-emerald-50/80 sm:flex-row sm:items-center sm:justify-between">',
  '                  {filters.saved === "1" && filters.savedResultId === row.fixture.result!.id ? (\n                    <div className="mt-5 rounded-2xl border border-emerald-300/35 bg-emerald-400/15 px-4 py-3 text-sm font-semibold text-emerald-100" role="status">\n                      ✓ Match details saved successfully.\n                    </div>\n                  ) : null}\n\n                  <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-emerald-400/15 bg-emerald-500/10 p-4 text-sm text-emerald-50/80 sm:flex-row sm:items-center sm:justify-between">',
  "inline save confirmation",
);

fs.writeFileSync(file, source, "utf8");
console.log("Match-details save feedback is applied.");
