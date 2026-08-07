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
    '  const [allDesigns, order, extraKitPaymentSummary] = await Promise.all([',
    '    listKitDesigns({ includeInactive: true }),',
    '    getTeamKitOrder(teamid),',
    '    getTeamExtraKitPaymentSummary(teamid),',
    '  ]);',
  ].join("\n"),
  [
    '  const [allDesigns, order, extraKitPaymentSummary, kitAssignments, kitMembers] =',
    '    await Promise.all([',
    '      listKitDesigns({ includeInactive: true }),',
    '      getTeamKitOrder(teamid),',
    '      getTeamExtraKitPaymentSummary(teamid),',
    '      listKitPlayerAssignments(teamid),',
    '      listAssignableKitMembers(teamid),',
    '    ]);',
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
    '  const kitAssignmentFormVersion = kitAssignments',
    '    .map((assignment) => `${assignment.position}:${assignment.updatedAt.getTime()}`)',
    '    .join("-");',
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
  '          key={`team-kit-order-${kitQuantity}`}',
  '          key={`team-kit-order-${kitQuantity}-${kitAssignmentFormVersion}`}',
  "kit form assignment refresh key",
);

replaceRequired(
  '          initialItems={order?.items ?? []}',
  '          initialItems={mergedInitialItems}',
  "completed player details in order form",
);

fs.writeFileSync(pagePath, source, "utf8");

if (
  !source.includes("TeamKitPlayerAssignments") ||
  !source.includes("listKitPlayerAssignments(teamid)") ||
  !source.includes("initialItems={mergedInitialItems}") ||
  !source.includes("kitAssignmentFormVersion")
) {
  throw new Error("Player kit assignment workflow was not mounted correctly.");
}

console.log(
  "Captains can assign the seven included kit slots to squad members, email secure forms and track completion.",
);

require("./apply-admin-kit-draft-visibility.cjs");
