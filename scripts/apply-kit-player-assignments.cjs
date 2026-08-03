const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pagePath = path.join(
  root,
  "src/app/captain/team/[teamid]/kit/page.tsx",
);
let source = fs.readFileSync(pagePath, "utf8");

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in captain kit page.`);
  }
  source = source.replace(before, after);
}

replaceRequired(
  'import TeamKitOrderForm from "@/components/captain/TeamKitOrderForm";',
  [
    'import TeamKitOrderForm from "@/components/captain/TeamKitOrderForm";',
    'import TeamKitPlayerAssignments from "@/components/captain/TeamKitPlayerAssignments";',
  ].join("\n"),
  "kit assignment component import",
);

replaceRequired(
  'import { getTeamKitOrder, listKitDesigns } from "@/lib/kits/db";',
  [
    'import { getTeamKitOrder, listKitDesigns } from "@/lib/kits/db";',
    'import {',
    '  listAssignableKitMembers,',
    '  listKitPlayerAssignments,',
    '} from "@/lib/kits/player-assignments";',
  ].join("\n"),
  "kit assignment data imports",
);

replaceRequired(
  [
    '  const [allDesigns, order] = await Promise.all([',
    '    listKitDesigns({ includeInactive: true }),',
    '    getTeamKitOrder(teamid),',
    '  ]);',
  ].join("\n"),
  [
    '  const [allDesigns, order, kitAssignments, kitMembers] = await Promise.all([',
    '    listKitDesigns({ includeInactive: true }),',
    '    getTeamKitOrder(teamid),',
    '    listKitPlayerAssignments(teamid),',
    '    listAssignableKitMembers(teamid),',
    '  ]);',
  ].join("\n"),
  "kit assignment page queries",
);

replaceRequired(
  '  const error = errorMessage(sp.error);',
  [
    '  const error = errorMessage(sp.error);',
    '  const initialItemByPosition = new Map(',
    '    kitAssignments',
    '      .filter(',
    '        (assignment) =>',
    '          assignment.status === "COMPLETED" &&',
    '          assignment.shirtNumber !== null &&',
    '          assignment.kitSize !== null,',
    '      )',
    '      .map((assignment) => [',
    '        assignment.position,',
    '        {',
    '          position: assignment.position,',
    '          backName: assignment.backName,',
    '          shirtNumber: assignment.shirtNumber!,',
    '          kitSize: assignment.kitSize!,',
    '        },',
    '      ] as const),',
    '  );',
    '  for (const item of order?.items ?? []) {',
    '    initialItemByPosition.set(item.position, item);',
    '  }',
    '  const mergedInitialItems = Array.from(initialItemByPosition.values()).sort(',
    '    (left, right) => left.position - right.position,',
    '  );',
  ].join("\n"),
  "completed player detail merge",
);

replaceRequired(
  '      {designs.length === 0 ? (',
  [
    '      <TeamKitPlayerAssignments',
    '        teamId={team.id}',
    '        locked={locked}',
    '        initialMembers={kitMembers}',
    '        initialAssignments={kitAssignments.map((assignment) => ({',
    '          ...assignment,',
    '          sentAt: assignment.sentAt?.toISOString() ?? null,',
    '          lastSentAt: assignment.lastSentAt?.toISOString() ?? null,',
    '          openedAt: assignment.openedAt?.toISOString() ?? null,',
    '          completedAt: assignment.completedAt?.toISOString() ?? null,',
    '          createdAt: assignment.createdAt.toISOString(),',
    '          updatedAt: assignment.updatedAt.toISOString(),',
    '          dispatchSentAt: assignment.dispatchSentAt?.toISOString() ?? null,',
    '        }))}',
    '      />',
    '',
    '      {designs.length === 0 ? (',
  ].join("\n"),
  "kit assignment panel",
);

replaceRequired(
  '          initialItems={order?.items ?? []}',
  '          initialItems={mergedInitialItems}',
  "completed player details in order form",
);

fs.writeFileSync(pagePath, source, "utf8");

// The paid-extra-kit patch runs immediately after this feature. Teach that patch
// to extend the already-expanded Promise.all query rather than looking for the
// original two-query version of the captain kit page.
const paidExtraPatchPath = path.join(
  root,
  "scripts/apply-paid-extra-kit-order-rows.cjs",
);
if (fs.existsSync(paidExtraPatchPath)) {
  let paidExtraPatch = fs.readFileSync(paidExtraPatchPath, "utf8");
  const oldBlock = [
    'replaceOnce(',
    '  pagePath,',
    '  [',
    '    "  const [allDesigns, order] = await Promise.all([",',
    '    "    listKitDesigns({ includeInactive: true }),",',
    '    "    getTeamKitOrder(teamid),",',
    '    "  ]);",',
    '  ].join("\n"),',
    '  [',
    '    "  const [allDesigns, order, extraKitPaymentSummary] = await Promise.all([",',
    '    "    listKitDesigns({ includeInactive: true }),",',
    '    "    getTeamKitOrder(teamid),",',
    '    "    getTeamExtraKitPaymentSummary(teamid),",',
    '    "  ]);",',
    '  ].join("\n"),',
    '  "extra-kit payment summary query",',
    ');',
  ].join("\n");
  const compatibleBlock = [
    'replaceOnce(',
    '  pagePath,',
    '  [',
    '    "  const [allDesigns, order, kitAssignments, kitMembers] = await Promise.all([",',
    '    "    listKitDesigns({ includeInactive: true }),",',
    '    "    getTeamKitOrder(teamid),",',
    '    "    listKitPlayerAssignments(teamid),",',
    '    "    listAssignableKitMembers(teamid),",',
    '    "  ]);",',
    '  ].join("\n"),',
    '  [',
    '    "  const [allDesigns, order, kitAssignments, kitMembers, extraKitPaymentSummary] = await Promise.all([",',
    '    "    listKitDesigns({ includeInactive: true }),",',
    '    "    getTeamKitOrder(teamid),",',
    '    "    listKitPlayerAssignments(teamid),",',
    '    "    listAssignableKitMembers(teamid),",',
    '    "    getTeamExtraKitPaymentSummary(teamid),",',
    '    "  ]);",',
    '  ].join("\n"),',
    '  "extra-kit payment summary query",',
    ');',
  ].join("\n");

  if (paidExtraPatch.includes(oldBlock)) {
    paidExtraPatch = paidExtraPatch.replace(oldBlock, compatibleBlock);
    fs.writeFileSync(paidExtraPatchPath, paidExtraPatch, "utf8");
  } else if (!paidExtraPatch.includes(compatibleBlock)) {
    throw new Error(
      "The paid-extra-kit build patch could not be made compatible with player kit assignments.",
    );
  }
}

if (
  !source.includes("TeamKitPlayerAssignments") ||
  !source.includes("listKitPlayerAssignments(teamid)") ||
  !source.includes("initialItems={mergedInitialItems}")
) {
  throw new Error("Player kit assignment workflow was not mounted correctly.");
}

console.log(
  "Captains can assign kit slots to squad members, email secure forms and track completion.",
);
