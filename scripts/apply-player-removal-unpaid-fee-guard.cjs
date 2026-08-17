const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function patchFile(relativePath, patcher) {
  const absolutePath = path.join(root, relativePath);
  const current = fs.readFileSync(absolutePath, "utf8");
  const next = patcher(current);
  fs.writeFileSync(absolutePath, next, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  return source.replace(before, after);
}

const guardImport = [
  'import {',
  '  formatOpenPlayerFeeRemovalMessage,',
  '  getOpenPlayerFeeSummary,',
  '} from "@/lib/players/player-removal-fee-guard";',
].join("\n");

patchFile("src/app/(admin)/admin/teams/[id]/squad/actions.ts", (input) => {
  let source = input;

  if (!source.includes(guardImport)) {
    source = replaceRequired(
      source,
      'import { prisma } from "@/lib/prisma";\nimport { requireAdmin } from "@/lib/requireAdmin";',
      `import { prisma } from "@/lib/prisma";\n${guardImport}\nimport { requireAdmin } from "@/lib/requireAdmin";`,
      "admin squad removal guard import",
    );
  }

  const removeGuardAnchor = [
    '  if (!membership) {',
    '    redirect(buildRedirect(teamId, "?error=Squad%20member%20not%20found."));',
    '  }',
    '',
    '  await prisma.$transaction(async (tx) => {',
  ].join("\n");
  const removeGuard = [
    '  if (!membership) {',
    '    redirect(buildRedirect(teamId, "?error=Squad%20member%20not%20found."));',
    '  }',
    '',
    '  const openFeeSummary = await getOpenPlayerFeeSummary({',
    '    teamId,',
    '    membershipId: membership.id,',
    '  });',
    '',
    '  if (openFeeSummary.count > 0) {',
    '    redirect(',
    '      buildRedirect(',
    '        teamId,',
    '        `?error=${encodeURIComponent(',
    '          formatOpenPlayerFeeRemovalMessage({ summary: openFeeSummary }),',
    '        )}`,',
    '      ),',
    '    );',
    '  }',
    '',
    '  await prisma.$transaction(async (tx) => {',
  ].join("\n");

  if (!source.includes("const openFeeSummary = await getOpenPlayerFeeSummary")) {
    source = replaceRequired(
      source,
      removeGuardAnchor,
      removeGuard,
      "admin remove-player unpaid fee guard",
    );
  }

  const prospectFailure = [
    '  if (!result.ok) {',
    '    redirect(buildRedirect(teamId, "?error=Squad%20member%20not%20found."));',
    '  }',
  ].join("\n");
  const guardedProspectFailure = [
    '  if (!result.ok) {',
    '    if (result.reason === "OPEN_FEES") {',
    '      redirect(',
    '        buildRedirect(',
    '          teamId,',
    '          `?error=${encodeURIComponent(',
    '            formatOpenPlayerFeeRemovalMessage({',
    '              summary: {',
    '                count: result.openFeeCount,',
    '                amountPence: result.openFeeAmountPence,',
    '              },',
    '            }),',
    '          )}`,',
    '        ),',
    '      );',
    '    }',
    '',
    '    redirect(buildRedirect(teamId, "?error=Squad%20member%20not%20found."));',
    '  }',
  ].join("\n");

  if (!source.includes('result.reason === "OPEN_FEES"')) {
    source = replaceRequired(
      source,
      prospectFailure,
      guardedProspectFailure,
      "admin move-to-prospects unpaid fee response",
    );
  }

  return source;
});

patchFile("src/lib/managed-squad/movePlayerToProspect.ts", (input) => {
  let source = input;

  if (!source.includes(guardImport)) {
    source = replaceRequired(
      source,
      'import { prisma } from "@/lib/prisma";',
      `import { prisma } from "@/lib/prisma";\n${guardImport}`,
      "managed squad removal guard import",
    );
  }

  source = replaceRequired(
    source,
    [
      'type MoveResult =',
      '  | { ok: true; prospectId: string }',
      '  | { ok: false; reason: "TEAM_MEMBER_NOT_FOUND" | "PROSPECT_NOT_FOUND" };',
    ].join("\n"),
    [
      'type MoveResult =',
      '  | { ok: true; prospectId: string }',
      '  | {',
      '      ok: false;',
      '      reason: "OPEN_FEES";',
      '      openFeeCount: number;',
      '      openFeeAmountPence: number;',
      '    }',
      '  | { ok: false; reason: "TEAM_MEMBER_NOT_FOUND" | "PROSPECT_NOT_FOUND" };',
    ].join("\n"),
    "managed squad move result type",
  );

  const membershipAnchor = [
    '  if (!membership) {',
    '    return { ok: false, reason: "TEAM_MEMBER_NOT_FOUND" };',
    '  }',
    '',
    '  const [profile, canRelinkInterestResponses] = await Promise.all([',
  ].join("\n");
  const membershipGuard = [
    '  if (!membership) {',
    '    return { ok: false, reason: "TEAM_MEMBER_NOT_FOUND" };',
    '  }',
    '',
    '  const openFeeSummary = await getOpenPlayerFeeSummary({',
    '    teamId: input.teamId,',
    '    membershipId: membership.id,',
    '  });',
    '',
    '  if (openFeeSummary.count > 0) {',
    '    return {',
    '      ok: false,',
    '      reason: "OPEN_FEES",',
    '      openFeeCount: openFeeSummary.count,',
    '      openFeeAmountPence: openFeeSummary.amountPence,',
    '    };',
    '  }',
    '',
    '  const [profile, canRelinkInterestResponses] = await Promise.all([',
  ].join("\n");

  if (!source.includes("openFeeAmountPence: openFeeSummary.amountPence")) {
    source = replaceRequired(
      source,
      membershipAnchor,
      membershipGuard,
      "managed squad unpaid fee guard",
    );
  }

  return source;
});

function patchMoveRoute(relativePath, fallbackMessage) {
  patchFile(relativePath, (input) => {
    let source = input;

    if (!source.includes(guardImport)) {
      source = replaceRequired(
        source,
        'import { moveTeamMemberToProspect } from "@/lib/managed-squad/movePlayerToProspect";\nimport { requireAdmin } from "@/lib/requireAdmin";',
        `import { moveTeamMemberToProspect } from "@/lib/managed-squad/movePlayerToProspect";\n${guardImport}\nimport { requireAdmin } from "@/lib/requireAdmin";`,
        `${relativePath} guard import`,
      );
    }

    const pattern = new RegExp(
      [
        '    if \\(!result\\.ok\\) \\{',
        '      return NextResponse\\.json\\(',
        `        \\{ error: "${fallbackMessage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" \\},`,
        '        \\{ status: 404 \\},',
        '      \\);',
        '    \\}',
      ].join('\\n'),
    );

    if (!source.includes('result.reason === "OPEN_FEES"')) {
      const replacement = [
        '    if (!result.ok) {',
        '      if (result.reason === "OPEN_FEES") {',
        '        return NextResponse.json(',
        '          {',
        '            error: formatOpenPlayerFeeRemovalMessage({',
        '              summary: {',
        '                count: result.openFeeCount,',
        '                amountPence: result.openFeeAmountPence,',
        '              },',
        '            }),',
        '          },',
        '          { status: 409 },',
        '        );',
        '      }',
        '',
        '      return NextResponse.json(',
        `        { error: "${fallbackMessage}" },`,
        '        { status: 404 },',
        '      );',
        '    }',
      ].join("\n");

      if (!pattern.test(source)) {
        throw new Error(`Expected ${relativePath} failure block was not found.`);
      }
      source = source.replace(pattern, replacement);
    }

    return source;
  });
}

patchMoveRoute(
  "src/app/api/captain/team/[teamid]/move-player-to-prospect/route.ts",
  "Squad member could not be moved to prospects.",
);
patchMoveRoute(
  "src/app/api/captain/team/[teamid]/mark-player-not-interested/route.ts",
  "Squad member could not be marked as not interested.",
);
patchMoveRoute(
  "src/app/api/captain/team/[teamid]/mark-player-duplicate/route.ts",
  "Squad member could not be marked as a duplicate.",
);

patchFile("src/app/api/captain/team/[teamid]/move-managed-player/route.ts", (input) => {
  let source = input;

  if (!source.includes(guardImport)) {
    source = replaceRequired(
      source,
      'import { prisma } from "@/lib/prisma";\nimport { requireAdmin } from "@/lib/requireAdmin";',
      `import { prisma } from "@/lib/prisma";\n${guardImport}\nimport { requireAdmin } from "@/lib/requireAdmin";`,
      "move-team unpaid fee guard import",
    );
  }

  const moveAnchor = [
    '    if (!membership) {',
    '      return NextResponse.json({ error: "Squad member not found." }, { status: 404 });',
    '    }',
    '',
    '    const existingTargetMembership = await prisma.teamMember.findFirst({',
  ].join("\n");
  const moveGuard = [
    '    if (!membership) {',
    '      return NextResponse.json({ error: "Squad member not found." }, { status: 404 });',
    '    }',
    '',
    '    const openFeeSummary = await getOpenPlayerFeeSummary({',
    '      teamId,',
    '      membershipId: membership.id,',
    '    });',
    '',
    '    if (openFeeSummary.count > 0) {',
    '      return NextResponse.json(',
    '        {',
    '          error: formatOpenPlayerFeeRemovalMessage({ summary: openFeeSummary }),',
    '        },',
    '        { status: 409 },',
    '      );',
    '    }',
    '',
    '    const existingTargetMembership = await prisma.teamMember.findFirst({',
  ].join("\n");

  if (!source.includes("formatOpenPlayerFeeRemovalMessage({ summary: openFeeSummary })")) {
    source = replaceRequired(
      source,
      moveAnchor,
      moveGuard,
      "move-team unpaid fee guard",
    );
  }

  return source;
});

patchFile("src/components/captain/ManagedSquadEditLinks.tsx", (input) => {
  const functionStart = input.indexOf("async function movePlayerToProspects(");
  const functionEnd = input.indexOf("\nasync function markPlayerNotInterested(", functionStart);

  if (functionStart < 0 || functionEnd < 0) {
    throw new Error("Expected managed squad PlayerPool move function was not found.");
  }

  const beforeBlock = input.slice(0, functionStart);
  const moveBlock = input.slice(functionStart, functionEnd);
  const afterBlock = input.slice(functionEnd);
  const currentDestination = 'window.location.href = "/admin/player-prospects";';
  const playerPoolDestination = 'window.location.href = "/admin/player-pool";';

  if (moveBlock.includes(playerPoolDestination)) return input;
  if (!moveBlock.includes(currentDestination)) {
    throw new Error("Expected managed squad PlayerPool success destination was not found.");
  }

  return `${beforeBlock}${moveBlock.replace(currentDestination, playerPoolDestination)}${afterBlock}`;
});

const verificationFiles = [
  "src/app/(admin)/admin/teams/[id]/squad/actions.ts",
  "src/lib/managed-squad/movePlayerToProspect.ts",
  "src/app/api/captain/team/[teamid]/move-player-to-prospect/route.ts",
  "src/app/api/captain/team/[teamid]/mark-player-not-interested/route.ts",
  "src/app/api/captain/team/[teamid]/mark-player-duplicate/route.ts",
  "src/app/api/captain/team/[teamid]/move-managed-player/route.ts",
];

for (const relativePath of verificationFiles) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  if (!source.includes("OPEN_FEES") && !source.includes("getOpenPlayerFeeSummary")) {
    throw new Error(`Unpaid fee removal guard was not applied to ${relativePath}.`);
  }
}

const managedSquadLinks = fs.readFileSync(
  path.join(root, "src/components/captain/ManagedSquadEditLinks.tsx"),
  "utf8",
);
const playerPoolMoveStart = managedSquadLinks.indexOf("async function movePlayerToProspects(");
const playerPoolMoveEnd = managedSquadLinks.indexOf(
  "\nasync function markPlayerNotInterested(",
  playerPoolMoveStart,
);
const playerPoolMoveBlock = managedSquadLinks.slice(playerPoolMoveStart, playerPoolMoveEnd);
if (
  playerPoolMoveStart < 0 ||
  playerPoolMoveEnd < 0 ||
  !playerPoolMoveBlock.includes('window.location.href = "/admin/player-pool";') ||
  playerPoolMoveBlock.includes('window.location.href = "/admin/player-prospects";')
) {
  throw new Error("Managed squad PlayerPool moves must finish on Admin PlayerPool.");
}

console.log(
  "Players with open match fees cannot be removed, moved to another team, moved to the player pool, marked not interested or marked as duplicates until those fees are resolved. Successful PlayerPool moves finish on Admin PlayerPool.",
);
