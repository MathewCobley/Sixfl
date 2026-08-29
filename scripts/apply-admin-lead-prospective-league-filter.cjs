const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

const files = {
  page: "src/app/(admin)/admin/leads/page.tsx",
  emailForm: "src/components/admin/leads/BulkLeadEmailForm.tsx",
  smsForm: "src/components/admin/leads/BulkLeadSmsForm.tsx",
  guardedActions: "src/app/(admin)/admin/leads/guarded-bulk-actions.ts",
};

function read(relativePath) {
  const filePath = path.join(root, ...relativePath.split("/"));
  if (!fs.existsSync(filePath)) {
    throw new Error(`Admin lead prospective-league filter: ${relativePath} was not found.`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function write(relativePath, source) {
  fs.writeFileSync(path.join(root, ...relativePath.split("/")), source, "utf8");
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) {
    return { source, changed: false };
  }
  if (!source.includes(before)) {
    throw new Error(`Admin lead prospective-league filter: ${label} anchor was not found.`);
  }
  return {
    source: source.replace(before, after),
    changed: true,
  };
}

function patchPage() {
  let source = read(files.page);
  let changed = false;

  function replace(before, after, label) {
    const result = replaceOnce(source, before, after, label);
    source = result.source;
    changed = result.changed || changed;
  }

  replace(
    `import { prisma } from "@/lib/prisma";`,
    `import { getCurrentLeagueOptions } from "@/lib/current-leagues";\nimport { formatProspectiveLeagueLabel } from "@/lib/leads/prospectiveLeague";\nimport { prisma } from "@/lib/prisma";`,
    "Admin Leads helper imports",
  );

  replace(
    `  night?: string;\n}>;`,
    `  night?: string;\n  league?: string;\n}>;`,
    "Admin Leads search parameters",
  );

  replace(
    `  const selectedNight = isPreferredNight(resolvedSearchParams.night) ? resolvedSearchParams.night : undefined;\n\n  const leadWhere: Prisma.InterestLeadWhereInput = {`,
    `  const selectedNight = isPreferredNight(resolvedSearchParams.night) ? resolvedSearchParams.night : undefined;\n  const selectedLeagueFilter = resolvedSearchParams.league?.trim() || undefined;\n  const selectedLeagueId =\n    selectedLeagueFilter && selectedLeagueFilter !== "unassigned"\n      ? selectedLeagueFilter\n      : undefined;\n  const buildFilteredHref = (params: Parameters<typeof buildHref>[0]) => {\n    const href = buildHref(params);\n    if (!selectedLeagueFilter) return href;\n    return href + (href.includes("?") ? "&" : "?") + "league=" + encodeURIComponent(selectedLeagueFilter);\n  };\n\n  const leadWhere: Prisma.InterestLeadWhereInput = {`,
    "selected prospective league",
  );

  replace(
    `    ...(selectedNight ? { preferredNights: { some: { night: selectedNight } } } : {}),\n  };`,
    `    ...(selectedNight ? { preferredNights: { some: { night: selectedNight } } } : {}),\n    ...(selectedLeagueFilter === "unassigned"\n      ? { leagueId: null }\n      : selectedLeagueId\n        ? { leagueId: selectedLeagueId }\n        : {}),\n  };`,
    "prospective-league Prisma filter",
  );

  replace(
    `  const [leads, stats, emailTemplatesRaw, smsTemplatesRaw, managedTeams] = await Promise.all([`,
    `  const [leads, stats, emailTemplatesRaw, smsTemplatesRaw, managedTeams, prospectiveLeagues] = await Promise.all([`,
    "prospective-league option query result",
  );

  replace(
    `    prisma.team.findMany({\n      where: {\n        teamMode: "MANAGED",\n      },\n      orderBy: { name: "asc" },\n      select: { id: true, name: true, leagueId: true },\n    }),\n  ]);`,
    `    prisma.team.findMany({\n      where: {\n        teamMode: "MANAGED",\n      },\n      orderBy: { name: "asc" },\n      select: { id: true, name: true, leagueId: true },\n    }),\n    getCurrentLeagueOptions(selectedLeagueId),\n  ]);`,
    "prospective-league option query",
  );

  if (!source.includes("href={buildFilteredHref(")) {
    const replacements = source.match(/href=\{buildHref\(/g)?.length ?? 0;
    if (replacements === 0) {
      throw new Error("Admin lead prospective-league filter: no filter links were found to preserve the selected league.");
    }
    source = source.replaceAll("href={buildHref(", "href={buildFilteredHref(");
    changed = true;
  }

  if (source.includes('label="All" href="/admin/leads"')) {
    source = source.replace(
      'label="All" href="/admin/leads"',
      'label="All" href={buildFilteredHref({})}',
    );
    changed = true;
  }

  if (!source.includes("!selectedNight && !selectedLeagueFilter")) {
    const activeFilter = "!selectedType && !selectedStatus && !selectedArea && !selectedNight";
    if (!source.includes(activeFilter)) {
      throw new Error("Admin lead prospective-league filter: All-filter active state anchor was not found.");
    }
    source = source.replaceAll(
      activeFilter,
      `${activeFilter} && !selectedLeagueFilter`,
    );
    changed = true;
  }

  if (!source.includes("Apply league filter")) {
    const hasExcludeFilters = source.includes("const excludedType =");
    const exclusionHiddenInputs = hasExcludeFilters
      ? `\n            {excludedType ? <input type="hidden" name="excludeType" value={excludedType} /> : null}\n            {excludedStatus ? <input type="hidden" name="excludeStatus" value={excludedStatus} /> : null}`
      : "";
    const clearHref = hasExcludeFilters
      ? `buildHref({ type: selectedType, status: selectedStatus, area: selectedArea, night: selectedNight, excludeType: excludedType, excludeStatus: excludedStatus })`
      : `buildHref({ type: selectedType, status: selectedStatus, area: selectedArea, night: selectedNight })`;

    const leadListAnchor = `      <AdminCard className="overflow-hidden p-0">\n        <div className="flex flex-col gap-1 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">`;
    if (!source.includes(leadListAnchor)) {
      throw new Error("Admin lead prospective-league filter: lead-list card anchor was not found.");
    }

    const leagueFilterCard = `      <AdminCard className="p-6">\n        <form method="get" className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">\n          <div className="min-w-0 flex-1">\n            <label htmlFor="prospective-league-filter" className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">\n              Prospective league\n            </label>\n            <p className="mt-1 text-sm text-white/55">Show leads for one planned league, or find leads that have not been assigned yet.</p>\n            {selectedType ? <input type="hidden" name="type" value={selectedType} /> : null}\n            {selectedStatus ? <input type="hidden" name="status" value={selectedStatus} /> : null}\n            {selectedArea ? <input type="hidden" name="area" value={selectedArea} /> : null}\n            {selectedNight ? <input type="hidden" name="night" value={selectedNight} /> : null}${exclusionHiddenInputs}\n            <select\n              id="prospective-league-filter"\n              name="league"\n              defaultValue={selectedLeagueFilter ?? ""}\n              className="mt-3 h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition focus:border-emerald-500/60 lg:max-w-2xl"\n            >\n              <option value="">All prospective leagues</option>\n              <option value="unassigned">No prospective league set</option>\n              {prospectiveLeagues.map((league) => (\n                <option key={league.id} value={league.id}>\n                  {formatProspectiveLeagueLabel(league)}\n                </option>\n              ))}\n            </select>\n          </div>\n          <div className="flex flex-wrap gap-3">\n            <button\n              type="submit"\n              className="inline-flex h-12 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-5 text-sm font-bold text-emerald-200 transition hover:bg-emerald-500/25"\n            >\n              Apply league filter\n            </button>\n            {selectedLeagueFilter ? (\n              <Link\n                href={${clearHref}}\n                className="inline-flex h-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-5 text-sm font-bold text-white/70 transition hover:bg-white/10 hover:text-white"\n              >\n                Clear league\n              </Link>\n            ) : null}\n          </div>\n        </form>\n      </AdminCard>\n\n`;

    source = source.replace(leadListAnchor, `${leagueFilterCard}${leadListAnchor}`);
    changed = true;
  }

  if (!source.includes("selectedLeague={selectedLeagueFilter}")) {
    const bulkPropAnchor = `                selectedNight={selectedNight}\n                recipientCount=`;
    const count = source.split(bulkPropAnchor).length - 1;
    if (count !== 2) {
      throw new Error(`Admin lead prospective-league filter: expected 2 bulk-form prop anchors, found ${count}.`);
    }
    source = source.replaceAll(
      bulkPropAnchor,
      `                selectedNight={selectedNight}\n                selectedLeague={selectedLeagueFilter}\n                recipientCount=`,
    );
    changed = true;
  }

  const required = [
    'league?: string;',
    'getCurrentLeagueOptions(selectedLeagueId)',
    'selectedLeagueFilter === "unassigned"',
    'Apply league filter',
    'href={buildFilteredHref(',
    'selectedLeague={selectedLeagueFilter}',
  ];
  for (const token of required) {
    if (!source.includes(token)) {
      throw new Error(`Admin lead prospective-league filter: page is missing ${token}.`);
    }
  }

  if (changed) write(files.page, source);
  return changed;
}

function patchEmailForm() {
  let source = read(files.emailForm);
  let changed = false;

  function replace(before, after, label) {
    const result = replaceOnce(source, before, after, label);
    source = result.source;
    changed = result.changed || changed;
  }

  replace(
    `  selectedNight,\n  recipientCount,`,
    `  selectedNight,\n  selectedLeague,\n  recipientCount,`,
    "bulk email selected-league prop",
  );

  replace(
    `    | "SUNDAY"\n    | "ANY";\n  recipientCount: number;`,
    `    | "SUNDAY"\n    | "ANY";\n  selectedLeague?: string;\n  recipientCount: number;`,
    "bulk email selected-league type",
  );

  replace(
    `      <input type="hidden" name="selectedNight" value={selectedNight ?? ""} />`,
    `      <input type="hidden" name="selectedNight" value={selectedNight ?? ""} />\n      <input type="hidden" name="selectedLeague" value={selectedLeague ?? ""} />`,
    "bulk email selected-league hidden field",
  );

  if (!source.includes('name="selectedLeague"')) {
    throw new Error("Admin lead prospective-league filter: bulk email form is missing selectedLeague.");
  }

  if (changed) write(files.emailForm, source);
  return changed;
}

function patchSmsForm() {
  let source = read(files.smsForm);
  let changed = false;

  function replace(before, after, label) {
    const result = replaceOnce(source, before, after, label);
    source = result.source;
    changed = result.changed || changed;
  }

  replace(
    `    selectedNight,\n    recipientCount = 0,`,
    `    selectedNight,\n    selectedLeague,\n    recipientCount = 0,`,
    "bulk SMS selected-league prop",
  );

  replace(
    `    selectedNight?: string | undefined;\n    recipientCount: number;`,
    `    selectedNight?: string | undefined;\n    selectedLeague?: string | undefined;\n    recipientCount: number;`,
    "bulk SMS selected-league type",
  );

  replace(
    `      <input type="hidden" name="selectedNight" value={selectedNight ?? ""} />`,
    `      <input type="hidden" name="selectedNight" value={selectedNight ?? ""} />\n      <input type="hidden" name="selectedLeague" value={selectedLeague ?? ""} />`,
    "bulk SMS selected-league hidden field",
  );

  if (!source.includes('name="selectedLeague"')) {
    throw new Error("Admin lead prospective-league filter: bulk SMS form is missing selectedLeague.");
  }

  if (changed) write(files.smsForm, source);
  return changed;
}

function patchGuardedActions() {
  let source = read(files.guardedActions);
  let changed = false;

  function replace(before, after, label) {
    const result = replaceOnce(source, before, after, label);
    source = result.source;
    changed = result.changed || changed;
  }

  replace(
    `  const selectedNightRaw = String(formData.get("selectedNight") ?? "")\n    .trim()\n    .toUpperCase();\n  const includedLeadIds = getIncludedLeadIds(formData);`,
    `  const selectedNightRaw = String(formData.get("selectedNight") ?? "")\n    .trim()\n    .toUpperCase();\n  const selectedLeague = String(formData.get("selectedLeague") ?? "").trim();\n  const includedLeadIds = getIncludedLeadIds(formData);`,
    "bulk action selected-league input",
  );

  replace(
    `    ...(selectedNightRaw && isPreferredNight(selectedNightRaw)\n      ? {\n          preferredNights: {\n            some: {\n              night: selectedNightRaw,\n            },\n          },\n        }\n      : {}),\n    AND: [`,
    `    ...(selectedNightRaw && isPreferredNight(selectedNightRaw)\n      ? {\n          preferredNights: {\n            some: {\n              night: selectedNightRaw,\n            },\n          },\n        }\n      : {}),\n    ...(selectedLeague === "unassigned"\n      ? { leagueId: null }\n      : selectedLeague\n        ? { leagueId: selectedLeague }\n        : {}),\n    AND: [`,
    "bulk action prospective-league filter",
  );

  replace(
    `function getTeamConfirmationLeadWhere(formData: FormData) {\n  return {\n    ...getLeadFilterWhere(formData, "email"),\n    interestType: InterestType.TEAM,\n    leagueId: {\n      not: null,\n    },\n  } satisfies Prisma.InterestLeadWhereInput;\n}`,
    `function getTeamConfirmationLeadWhere(formData: FormData) {\n  return {\n    AND: [\n      getLeadFilterWhere(formData, "email"),\n      { interestType: InterestType.TEAM },\n      { leagueId: { not: null } },\n    ],\n  } satisfies Prisma.InterestLeadWhereInput;\n}`,
    "team-confirmation prospective-league safeguard",
  );

  const required = [
    'formData.get("selectedLeague")',
    'selectedLeague === "unassigned"',
    'getLeadFilterWhere(formData, "email")',
    '{ leagueId: { not: null } }',
  ];
  for (const token of required) {
    if (!source.includes(token)) {
      throw new Error(`Admin lead prospective-league filter: guarded actions are missing ${token}.`);
    }
  }

  if (changed) write(files.guardedActions, source);
  return changed;
}

function applyAll() {
  return [patchPage(), patchEmailForm(), patchSmsForm(), patchGuardedActions()].filter(Boolean).length;
}

const firstPassChangedFiles = applyAll();
const secondPassChangedFiles = applyAll();

if (secondPassChangedFiles !== 0) {
  throw new Error("Admin lead prospective-league filter: the preparation step is not idempotent.");
}

if (firstPassChangedFiles > 0) {
  console.log(`Admin Leads prospective-league filter applied to ${firstPassChangedFiles} file(s).`);
} else {
  console.log("Admin Leads prospective-league filter already applied.");
}
