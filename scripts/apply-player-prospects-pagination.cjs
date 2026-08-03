const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(
  process.cwd(),
  "src/app/(admin)/admin/player-prospects/page.tsx",
);
let source = fs.readFileSync(pagePath, "utf8");

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in player prospects page.`);
  }
  source = source.replace(before, after);
}

replaceOnce(
  [
    "type SearchParams = {",
    "  saved?: string;",
    "  error?: string;",
    "  leagueId?: string;",
    "};",
  ].join("\n"),
  [
    'type ProspectView = "pipeline" | "active" | "duplicates" | "declined";',
    "",
    "type SearchParams = {",
    "  saved?: string;",
    "  error?: string;",
    "  leagueId?: string;",
    "  view?: string;",
    "  page?: string;",
    "};",
    "",
    "const PROSPECTS_PER_PAGE = 15;",
  ].join("\n"),
  "prospect pagination search params",
);

replaceOnce(
  [
    "function getLeagueLabel(league: LeagueFilterOption) {",
    "  const parts = [league.name, league.season, league.area, league.dayOfWeek].filter(Boolean);",
    '  return parts.join(" · ");',
    "}",
  ].join("\n"),
  [
    "function getLeagueLabel(league: LeagueFilterOption) {",
    "  const parts = [league.name, league.season, league.area, league.dayOfWeek].filter(Boolean);",
    '  return parts.join(" · ");',
    "}",
    "",
    "function buildProspectViewHref(input: {",
    "  leagueId: string;",
    "  view: ProspectView;",
    "  page?: number;",
    "}) {",
    "  const params = new URLSearchParams();",
    '  if (input.leagueId) params.set("leagueId", input.leagueId);',
    '  if (input.view !== "pipeline") params.set("view", input.view);',
    '  if ((input.page ?? 1) > 1) params.set("page", String(input.page));',
    "  const query = params.toString();",
    '  return `/admin/player-prospects${query ? `?${query}` : ""}`;',
    "}",
  ].join("\n"),
  "prospect view URL helper",
);

replaceOnce(
  [
    "  const filters = (await searchParams) ?? {};",
    '  const selectedLeagueId = String(filters.leagueId ?? "").trim();',
  ].join("\n"),
  [
    "  const filters = (await searchParams) ?? {};",
    '  const selectedLeagueId = String(filters.leagueId ?? "").trim();',
    '  const requestedView = String(filters.view ?? "").trim();',
    "  const selectedView: ProspectView =",
    '    requestedView === "active" ||',
    '    requestedView === "duplicates" ||',
    '    requestedView === "declined"',
    "      ? requestedView",
    '      : "pipeline";',
    "  const requestedPage = Math.max(",
    "    1,",
    '    Number.parseInt(String(filters.page ?? "1"), 10) || 1,',
    "  );",
  ].join("\n"),
  "selected prospect view and page",
);

replaceOnce(
  [
    '  const duplicateProspects = prospects.filter((prospect) => !isActivelyUsedProspect(prospect) && prospect.status === "DUPLICATE");',
    "  const savedMessage = getSavedMessage(filters.saved);",
  ].join("\n"),
  [
    '  const duplicateProspects = prospects.filter((prospect) => !isActivelyUsedProspect(prospect) && prospect.status === "DUPLICATE");',
    "  const viewProspects =",
    '    selectedView === "active"',
    "      ? activeSquadProspects",
    '      : selectedView === "duplicates"',
    "        ? duplicateProspects",
    '        : selectedView === "declined"',
    "          ? declinedProspects",
    "          : pipelineProspects;",
    "  const totalPages = Math.max(",
    "    1,",
    "    Math.ceil(viewProspects.length / PROSPECTS_PER_PAGE),",
    "  );",
    "  const currentPage = Math.min(requestedPage, totalPages);",
    "  const pagedProspects = viewProspects.slice(",
    "    (currentPage - 1) * PROSPECTS_PER_PAGE,",
    "    currentPage * PROSPECTS_PER_PAGE,",
    "  );",
    "  const pageStart = viewProspects.length",
    "    ? (currentPage - 1) * PROSPECTS_PER_PAGE + 1",
    "    : 0;",
    "  const pageEnd = Math.min(",
    "    currentPage * PROSPECTS_PER_PAGE,",
    "    viewProspects.length,",
    "  );",
    "  const savedMessage = getSavedMessage(filters.saved);",
  ].join("\n"),
  "prospect pagination calculation",
);

const messagesAnchor =
  '      {errorMessage ? <section className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">{errorMessage}</section> : null}\n\n';
if (!source.includes("Prospect views") && source.includes(messagesAnchor)) {
  source = source.replace(
    messagesAnchor,
    messagesAnchor +
      [
        '      <nav className="grid gap-2 rounded-3xl border border-white/10 bg-white/[0.04] p-3 sm:grid-cols-4" aria-label="Prospect views">',
        "        {([",
        '          ["pipeline", "Open pipeline", pipelineProspects.length],',
        '          ["active", "Active players", activeSquadProspects.length],',
        '          ["duplicates", "Duplicates", duplicateProspects.length],',
        '          ["declined", "Not interested", declinedProspects.length],',
        "        ] as Array<[ProspectView, string, number]>).map(([view, label, count]) => (",
        "          <Link",
        "            key={view}",
        "            href={buildProspectViewHref({ leagueId: selectedLeagueId, view })}",
        "            className={[",
        '              "flex min-h-12 items-center justify-between rounded-2xl border px-4 py-3 text-sm font-semibold transition",',
        "              selectedView === view",
        '                ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-100"',
        '                : "border-white/10 bg-black/20 text-white/65 hover:border-white/20 hover:bg-white/[0.06] hover:text-white",',
        '            ].join(" ")}',
        "          >",
        "            <span>{label}</span>",
        '            <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-xs">',
        "              {count}",
        "            </span>",
        "          </Link>",
        "        ))}",
        "      </nav>",
        "",
      ].join("\n"),
  );
}

replaceOnce(
  '      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">\n        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">\n          <div>\n            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Open player prospects</p>',
  '      {selectedView === "pipeline" ? (\n      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">\n        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">\n          <div>\n            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Open player prospects</p>',
  "pipeline section conditional",
);

replaceOnce(
  [
    "          <div className=\"text-sm text-white/50\">",
    "            {pipelineProspects.length} shown · {unassignedProspects.length} unassigned · {activeSquadProspects.length} active players below",
    '            {declinedProspects.length ? ` · ${declinedProspects.length} not interested` : ""}',
    '            {duplicateProspects.length ? ` · ${duplicateProspects.length} duplicated` : ""}',
    "          </div>",
  ].join("\n"),
  [
    '          <div className="text-sm text-white/50">',
    "            Showing {pageStart}-{pageEnd} of {pipelineProspects.length} · {unassignedProspects.length} unassigned",
    "          </div>",
  ].join("\n"),
  "pipeline page summary",
);

source = source.replace(
  "          {pipelineProspects.map((prospect) => (",
  "          {pagedProspects.map((prospect) => (",
);

replaceOnce(
  "      </section>\n\n      {activeSquadProspects.length > 0 ? (",
  '      </section>\n      ) : null}\n\n      {selectedView === "active" && activeSquadProspects.length > 0 ? (',
  "pipeline close and active view guard",
);

source = source.replace(
  "            {activeSquadProspects.map((prospect) => (",
  "            {pagedProspects.map((prospect) => (",
);
source = source.replace(
  "      {duplicateProspects.length > 0 ? (",
  '      {selectedView === "duplicates" && duplicateProspects.length > 0 ? (',
);
source = source.replace(
  "            {duplicateProspects.map((prospect) => <ProspectCard",
  "            {pagedProspects.map((prospect) => <ProspectCard",
);
source = source.replace(
  "      {declinedProspects.length > 0 ? (",
  '      {selectedView === "declined" && declinedProspects.length > 0 ? (',
);
source = source.replace(
  "            {declinedProspects.map((prospect) => <ProspectCard",
  "            {pagedProspects.map((prospect) => <ProspectCard",
);

const closingAnchor = "      ) : null}\n    </div>\n  );\n}";
if (!source.includes("Page {currentPage} of {totalPages}") && source.includes(closingAnchor)) {
  source = source.replace(
    closingAnchor,
    [
      "      ) : null}",
      "",
      "      {totalPages > 1 ? (",
      '        <nav className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Prospect pages">',
      '          <div className="text-sm text-white/55">',
      "            Page {currentPage} of {totalPages} · showing {pageStart}-{pageEnd} of {viewProspects.length}",
      "          </div>",
      '          <div className="flex gap-2">',
      "            {currentPage > 1 ? (",
      "              <Link",
      "                href={buildProspectViewHref({ leagueId: selectedLeagueId, view: selectedView, page: currentPage - 1 })}",
      '                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-white/75 transition hover:bg-white/[0.06] hover:text-white"',
      "              >",
      "                Previous",
      "              </Link>",
      "            ) : null}",
      "            {currentPage < totalPages ? (",
      "              <Link",
      "                href={buildProspectViewHref({ leagueId: selectedLeagueId, view: selectedView, page: currentPage + 1 })}",
      '                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"',
      "              >",
      "                Next",
      "              </Link>",
      "            ) : null}",
      "          </div>",
      "        </nav>",
      "      ) : null}",
      "    </div>",
      "  );",
      "}",
    ].join("\n"),
  );
}

fs.writeFileSync(pagePath, source, "utf8");

const requiredMarkers = [
  "const PROSPECTS_PER_PAGE = 15;",
  'type ProspectView = "pipeline" | "active" | "duplicates" | "declined";',
  'aria-label="Prospect views"',
  "const pagedProspects = viewProspects.slice(",
  "Page {currentPage} of {totalPages}",
  'selectedView === "active"',
];
for (const marker of requiredMarkers) {
  if (!source.includes(marker)) {
    throw new Error(`Player prospects pagination marker missing: ${marker}`);
  }
}

console.log(
  "Player prospects now render one 15-record view at a time, with separate archive tabs and pagination.",
);
