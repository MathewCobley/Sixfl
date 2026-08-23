const fs = require("node:fs");
const path = require("node:path");

const file = path.join(process.cwd(), "src", "app", "(admin)", "admin", "leads", "page.tsx");
let source = fs.readFileSync(file, "utf8");

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Admin lead exclude filters: ${label} anchor not found.`);
  source = source.replace(before, after);
}

replaceOnce(
  `  status?: string;\n  area?: string;`,
  `  status?: string;\n  excludeType?: string;\n  excludeStatus?: string;\n  area?: string;`,
  "search params",
);

replaceOnce(
  `  status?: string;\n  area?: string;\n  night?: string;\n}) {\n  const search = new URLSearchParams();\n\n  if (params.type) search.set("type", params.type);\n  if (params.status) search.set("status", params.status);\n  if (params.area) search.set("area", params.area);`,
  `  status?: string;\n  excludeType?: string;\n  excludeStatus?: string;\n  area?: string;\n  night?: string;\n}) {\n  const search = new URLSearchParams();\n\n  if (params.type) search.set("type", params.type);\n  if (params.status) search.set("status", params.status);\n  if (params.excludeType) search.set("excludeType", params.excludeType);\n  if (params.excludeStatus) search.set("excludeStatus", params.excludeStatus);\n  if (params.area) search.set("area", params.area);`,
  "buildHref",
);

replaceOnce(
  `  const selectedStatus = isLeadStatus(resolvedSearchParams.status) ? resolvedSearchParams.status : undefined;\n  const selectedArea = resolvedSearchParams.area?.trim() || undefined;`,
  `  const selectedStatus = isLeadStatus(resolvedSearchParams.status) ? resolvedSearchParams.status : undefined;\n  const excludedType = isInterestType(resolvedSearchParams.excludeType) ? resolvedSearchParams.excludeType : undefined;\n  const excludedStatus = isLeadStatus(resolvedSearchParams.excludeStatus) ? resolvedSearchParams.excludeStatus : undefined;\n  const selectedArea = resolvedSearchParams.area?.trim() || undefined;`,
  "selected exclusions",
);

replaceOnce(
  `    ...(selectedStatus ? { status: selectedStatus } : {}),\n    ...(selectedArea ? { area: selectedArea } : {}),`,
  `    ...(selectedStatus ? { status: selectedStatus } : {}),\n    ...(excludedType || excludedStatus\n      ? {\n          NOT: [\n            ...(excludedType ? [{ interestType: excludedType }] : []),\n            ...(excludedStatus ? [{ status: excludedStatus }] : []),\n          ],\n        }\n      : {}),\n    ...(selectedArea ? { area: selectedArea } : {}),`,
  "Prisma exclusions",
);

if (!source.includes("function ExcludeFilterChip")) {
  const statIndex = source.indexOf("function StatCard(");
  if (statIndex < 0) throw new Error("Admin lead exclude filters: StatCard anchor not found.");
  const component = `function ExcludeFilterChip({ label, href, active }: { label: string; href: string; active: boolean }) {\n  return (\n    <Link\n      href={href}\n      className={[\n        "inline-flex h-10 items-center justify-center rounded-full px-4 text-xs font-bold tracking-[0.16em] transition",\n        active\n          ? "border border-amber-400/40 bg-amber-500/15 text-amber-200"\n          : "border border-white/10 bg-white/5 text-white/60 hover:border-amber-400/30 hover:bg-amber-500/10 hover:text-amber-100",\n      ].join(" ")}\n    >\n      {label}\n    </Link>\n  );\n}\n\n`;
  source = source.slice(0, statIndex) + component + source.slice(statIndex);
}

const marker = "Filter the lead list without opening bulk messaging.";
if (!source.includes("Exclude from results")) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error("Admin lead exclude filters: filter card marker not found.");
  const sectionStart = source.lastIndexOf("<section", markerIndex);
  const sectionEndStart = source.indexOf("</section>", markerIndex);
  if (sectionStart < 0 || sectionEndStart < 0) throw new Error("Admin lead exclude filters: filter section bounds not found.");
  const sectionEnd = sectionEndStart + "</section>".length;

  const block = `<section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">\n        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">\n          <div>\n            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/45">Filters</p>\n            <p className="mt-2 text-sm text-white/60">Filter the lead list without opening bulk messaging.</p>\n          </div>\n\n          <div className="space-y-4">\n            <div className="flex flex-wrap gap-3">\n              <FilterChip label="All" active={!selectedType && !selectedStatus} href={buildHref({ area: selectedArea, night: selectedNight, excludeType, excludeStatus })} />\n              <FilterChip label="Team" active={selectedType === "TEAM"} href={buildHref({ type: "TEAM", status: selectedStatus, area: selectedArea, night: selectedNight, excludeType, excludeStatus })} />\n              <FilterChip label="Player" active={selectedType === "PLAYER"} href={buildHref({ type: "PLAYER", status: selectedStatus, area: selectedArea, night: selectedNight, excludeType, excludeStatus })} />\n              <FilterChip label="Referee" active={selectedType === "REFEREE"} href={buildHref({ type: "REFEREE", status: selectedStatus, area: selectedArea, night: selectedNight, excludeType, excludeStatus })} />\n              <FilterChip label="New" active={selectedStatus === "NEW"} href={buildHref({ type: selectedType, status: "NEW", area: selectedArea, night: selectedNight, excludeType, excludeStatus })} />\n              <FilterChip label="Contacted" active={selectedStatus === "CONTACTED"} href={buildHref({ type: selectedType, status: "CONTACTED", area: selectedArea, night: selectedNight, excludeType, excludeStatus })} />\n              <FilterChip label="Qualified" active={selectedStatus === "QUALIFIED"} href={buildHref({ type: selectedType, status: "QUALIFIED", area: selectedArea, night: selectedNight, excludeType, excludeStatus })} />\n              <FilterChip label="Closed" active={selectedStatus === "CLOSED"} href={buildHref({ type: selectedType, status: "CLOSED", area: selectedArea, night: selectedNight, excludeType, excludeStatus })} />\n            </div>\n\n            <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">\n              <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-200/70">Exclude from results</span>\n              <ExcludeFilterChip label="Team" active={excludedType === "TEAM"} href={buildHref({ type: selectedType, status: selectedStatus, area: selectedArea, night: selectedNight, excludeType: excludedType === "TEAM" ? undefined : "TEAM", excludeStatus })} />\n              <ExcludeFilterChip label="Player" active={excludedType === "PLAYER"} href={buildHref({ type: selectedType, status: selectedStatus, area: selectedArea, night: selectedNight, excludeType: excludedType === "PLAYER" ? undefined : "PLAYER", excludeStatus })} />\n              <ExcludeFilterChip label="Referee" active={excludedType === "REFEREE"} href={buildHref({ type: selectedType, status: selectedStatus, area: selectedArea, night: selectedNight, excludeType: excludedType === "REFEREE" ? undefined : "REFEREE", excludeStatus })} />\n              <ExcludeFilterChip label="New" active={excludedStatus === "NEW"} href={buildHref({ type: selectedType, status: selectedStatus, area: selectedArea, night: selectedNight, excludeType, excludeStatus: excludedStatus === "NEW" ? undefined : "NEW" })} />\n              <ExcludeFilterChip label="Contacted" active={excludedStatus === "CONTACTED"} href={buildHref({ type: selectedType, status: selectedStatus, area: selectedArea, night: selectedNight, excludeType, excludeStatus: excludedStatus === "CONTACTED" ? undefined : "CONTACTED" })} />\n              <ExcludeFilterChip label="Qualified" active={excludedStatus === "QUALIFIED"} href={buildHref({ type: selectedType, status: selectedStatus, area: selectedArea, night: selectedNight, excludeType, excludeStatus: excludedStatus === "QUALIFIED" ? undefined : "QUALIFIED" })} />\n              <ExcludeFilterChip label="Closed" active={excludedStatus === "CLOSED"} href={buildHref({ type: selectedType, status: selectedStatus, area: selectedArea, night: selectedNight, excludeType, excludeStatus: excludedStatus === "CLOSED" ? undefined : "CLOSED" })} />\n              {(excludedType || excludedStatus) ? (\n                <Link href={buildHref({ type: selectedType, status: selectedStatus, area: selectedArea, night: selectedNight })} className="inline-flex h-10 items-center rounded-full border border-white/10 px-4 text-xs font-bold tracking-[0.12em] text-white/55 hover:bg-white/5 hover:text-white">\n                  Clear exclusions\n                </Link>\n              ) : null}\n            </div>\n          </div>\n        </div>\n      </section>`;

  source = source.slice(0, sectionStart) + block + source.slice(sectionEnd);
}

const required = [
  'excludeType?: string;',
  'excludeStatus?: string;',
  'Exclude from results',
  'NOT: [',
  'function ExcludeFilterChip',
];
for (const token of required) {
  if (!source.includes(token)) throw new Error(`Admin lead exclude filters: missing ${token}`);
}

fs.writeFileSync(file, source, "utf8");
console.log("Admin lead include/exclude filters applied.");
