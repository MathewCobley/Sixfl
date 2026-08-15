const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const write = (file, source) => fs.writeFileSync(path.join(root, file), source, "utf8");

const pagePath = "src/app/captain/team/[teamid]/kit/page.tsx";
const formPath = "src/components/captain/TeamKitOrderForm.tsx";
const actionPath = "src/app/captain/team/[teamid]/kit/actions.ts";

let page = read(pagePath);
let form = read(formPath);
let action = read(actionPath);

// Captain page: load the league id and all designs already submitted by another
// team in the same league. Draft/cancelled orders do not reserve a design.
if (!page.includes('id: true,\n          name: true,\n          season: true,')) {
  page = page.replace(
    '        select: {\n          name: true,\n          season: true,\n        },',
    '        select: {\n          id: true,\n          name: true,\n          season: true,\n        },',
  );
}

if (!page.includes('const takenDesignIds = new Set')) {
  page = page.replace(
    '  const selectedDesignId = order?.kitDesignId ?? null;\n',
    `  const selectedDesignId = order?.kitDesignId ?? null;\n  const takenDesignRows = team.league?.id\n    ? await prisma.$queryRaw<Array<{ kitDesignId: string }>>\`\n        SELECT DISTINCT orders."kitDesignId"\n        FROM "TeamKitOrder" orders\n        JOIN "Team" other_team ON other_team."id" = orders."teamId"\n        WHERE other_team."leagueId" = \${team.league.id}\n          AND orders."teamId" <> \${teamid}\n          AND orders."kitDesignId" IS NOT NULL\n          AND orders."status"::text NOT IN ('DRAFT', 'CANCELLED')\n      \`\n    : [];\n  const takenDesignIds = new Set(takenDesignRows.map((row) => row.kitDesignId));\n`,
  );
}

if (!page.includes('taken: takenDesignIds.has(design.id)')) {
  page = page.replace(
    '            updatedAtIso: design.updatedAt.toISOString(),\n',
    '            updatedAtIso: design.updatedAt.toISOString(),\n            taken: takenDesignIds.has(design.id) && design.id !== selectedDesignId,\n',
  );
}

if (!page.includes('error === "design_taken"')) {
  page = page.replace(
    '  if (error === "design_unavailable") {\n    return "That kit design is no longer available. Please choose another design.";\n  }',
    '  if (error === "design_unavailable") {\n    return "That kit design is no longer available. Please choose another design.";\n  }\n  if (error === "design_taken") {\n    return "That kit design has already been submitted by another team in your league. Please choose another design.";\n  }',
  );
}

// Form: show reserved designs but make them unselectable and clearly labelled.
if (!form.includes('  taken: boolean;')) {
  form = form.replace(
    '  updatedAtIso: string;\n};',
    '  updatedAtIso: string;\n  taken: boolean;\n};',
  );
}

if (!form.includes('const unavailable = design.taken && !selected;')) {
  form = form.replace(
    '                  const selected = design.id === selectedDesignId;\n',
    '                  const selected = design.id === selectedDesignId;\n                  const unavailable = design.taken && !selected;\n',
  );
}

// Older catalogue cards selected the design using the whole card button.
form = form.replace(
  '                      onClick={() => setSelectedDesignId(design.id)}\n                      aria-pressed={selected}',
  '                      onClick={() => { if (!unavailable) setSelectedDesignId(design.id); }}\n                      disabled={unavailable}\n                      aria-disabled={unavailable}\n                      aria-pressed={selected}',
);

// Current catalogue cards use an image lightbox with a separate Choose button.
// Apply the same reservation protection to that real interactive control.
form = form.replace(
  '                        onClick={() => setSelectedDesignId(design.id)}\n                        aria-pressed={selected}',
  '                        onClick={() => { if (!unavailable) setSelectedDesignId(design.id); }}\n                        disabled={unavailable}\n                        aria-disabled={unavailable}\n                        aria-pressed={selected}',
);

if (!form.includes('unavailable\n                          ? "cursor-not-allowed border-white/5 bg-black/10 opacity-35 grayscale"')) {
  form = form.replace(
    '                        selected\n                          ? "border-emerald-400/60 bg-emerald-500/15 ring-2 ring-emerald-400/20"\n                          : "border-white/10 bg-black/20 hover:border-white/25 hover:bg-white/[0.05]",',
    '                        selected\n                          ? "border-emerald-400/60 bg-emerald-500/15 ring-2 ring-emerald-400/20"\n                          : unavailable\n                            ? "cursor-not-allowed border-white/5 bg-black/10 opacity-35 grayscale"\n                            : "border-white/10 bg-black/20 hover:border-white/25 hover:bg-white/[0.05]",',
  );
}

// Older card markup gets a dedicated Taken line.
if (!form.includes('{unavailable ? (\n                          <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-200">Taken</div>')) {
  form = form.replace(
    '                        <div className="mt-0.5 truncate text-[11px] text-white/40">\n                          {design.name ?? "Team kit"}\n                        </div>',
    '                        <div className="mt-0.5 truncate text-[11px] text-white/40">\n                          {design.name ?? "Team kit"}\n                        </div>\n                        {unavailable ? (\n                          <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-200">Taken</div>\n                        ) : null}',
  );
}

// Current lightbox card uses the right-hand Choose/Selected badge. Reuse that
// badge for Taken so there is no second competing action label.
if (!form.includes('unavailable ? "Taken" : selected ? "Selected" : "Choose"')) {
  form = form.replace(
    '{selected ? "Selected" : "Choose"}',
    '{unavailable ? "Taken" : selected ? "Selected" : "Choose"}',
  );
}

// Server guard: never rely on the disabled UI alone. Reject a design if another
// team in the same league has already submitted/approved/ordered/fulfilled it.
if (!action.includes('const designConflict = await prisma.$queryRaw')) {
  action = action.replace(
    '  const design = await getKitDesignById(kitDesignId);\n  if (!design) {\n    redirect(buildRedirect(teamId, { error: "design_unavailable" }));\n  }\n',
    `  const design = await getKitDesignById(kitDesignId);\n  if (!design) {\n    redirect(buildRedirect(teamId, { error: "design_unavailable" }));\n  }\n\n  const designConflict = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql\`\n    SELECT orders."id"\n    FROM "TeamKitOrder" orders\n    JOIN "Team" this_team ON this_team."id" = \${teamId}\n    JOIN "Team" other_team ON other_team."id" = orders."teamId"\n    WHERE other_team."leagueId" = this_team."leagueId"\n      AND orders."teamId" <> \${teamId}\n      AND orders."kitDesignId" = \${kitDesignId}\n      AND orders."status"::text NOT IN ('DRAFT', 'CANCELLED')\n    LIMIT 1\n  \`);\n  if (designConflict[0]) {\n    redirect(buildRedirect(teamId, { error: "design_taken" }));\n  }\n`,
  );
}

const hasTakenLabel =
  form.includes('unavailable ? "Taken" : selected ? "Selected" : "Choose"') ||
  form.includes('text-amber-200">Taken</div>');

if (
  !page.includes("const takenDesignIds = new Set") ||
  !page.includes("taken: takenDesignIds.has(design.id)") ||
  !form.includes("const unavailable = design.taken && !selected;") ||
  !form.includes("disabled={unavailable}") ||
  !form.includes("aria-disabled={unavailable}") ||
  !form.includes("opacity-35 grayscale") ||
  !hasTakenLabel ||
  !action.includes("designConflict") ||
  !action.includes('error: "design_taken"')
) {
  throw new Error(
    "League kit design reservation was not fully applied to the final captain kit UI and server action.",
  );
}

write(pagePath, page);
write(formPath, form);
write(actionPath, action);
console.log("Submitted kit designs are now reserved per league and shown as Taken to other teams.");
