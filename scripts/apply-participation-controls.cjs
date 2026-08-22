const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function patchFile(relativePath, transform) {
  const filePath = path.join(root, relativePath);
  const before = fs.readFileSync(filePath, "utf8");
  const after = transform(before);

  if (after !== before) {
    fs.writeFileSync(filePath, after, "utf8");
    console.log(`Applied participation controls to ${relativePath}`);
  }
}

function insertOnce(source, marker, anchor, insertion) {
  if (source.includes(marker)) return source;
  if (!source.includes(anchor)) {
    throw new Error(`Participation control patch anchor not found: ${anchor}`);
  }
  return source.replace(anchor, `${insertion}${anchor}`);
}

patchFile("src/components/admin/AdminSidebar.tsx", (source) => {
  const marker = 'href: "/admin/participation-controls"';
  const anchor = `      {\n        name: "Backfill",\n        href: "/admin/fixtures/backfill",`;
  const insertion = `      {\n        name: "Participation controls",\n        href: "/admin/participation-controls",\n        icon: ShieldCheckIcon,\n        description: "Blocks/suspensions",\n      },\n`;
  return insertOnce(source, marker, anchor, insertion);
});

patchFile("src/app/(public)/claim/page.tsx", (source) => {
  source = insertOnce(
    source,
    'from "@/lib/participation/controls"',
    'import { prisma } from "@/lib/prisma";\n',
    'import { getCaptainClaimRestriction } from "@/lib/participation/controls";\n',
  );

  source = insertOnce(
    source,
    "const claimRestriction = await getCaptainClaimRestriction",
    "  const allowedEmails = getAllowedClaimEmails(team);\n",
    `  const claimRestriction = await getCaptainClaimRestriction({\n    teamId: team.id,\n    userId: user.id,\n  });\n\n  if (claimRestriction.blocked) {\n    return {\n      ok: false as const,\n      error: claimRestriction.code,\n      code,\n    };\n  }\n\n`,
  );

  const errorAnchor = `          {error === "already_claimed" && (\n            <div className="text-red-300">`;
  const errorInsertion = `          {error === "team_blocked" && (\n            <div className="text-red-300">\n              This team is not permitted to re-register or be reclaimed. Contact SIXFL if you believe this is an error.\n            </div>\n          )}\n          {error === "team_review" && (\n            <div className="text-amber-300">\n              This team registration is being held for SIXFL admin review before captain access can be activated.\n            </div>\n          )}\n          {error === "management_restricted" && (\n            <div className="text-red-300">\n              This account is not currently permitted to create, claim or manage a SIXFL team. Please contact SIXFL.\n            </div>\n          )}\n`;
  source = insertOnce(source, 'error === "management_restricted"', errorAnchor, errorInsertion);

  return source;
});

patchFile("src/lib/requireCaptain.ts", (source) => {
  source = insertOnce(
    source,
    'from "@/lib/participation/controls"',
    'import { prisma } from "@/lib/prisma";\n',
    'import { getCaptainClaimRestriction } from "@/lib/participation/controls";\n',
  );

  const anchor = "  const isManagedTeam = team?.teamMode === \"MANAGED\";\n";
  const insertion = `  if (user && !rawIsAdmin) {\n    const restriction = await getCaptainClaimRestriction({\n      teamId,\n      userId: user.id,\n    });\n\n    if (restriction.blocked) {\n      redirect(\`/dashboard?teamAccess=\${restriction.code}\`);\n    }\n  }\n\n`;
  source = insertOnce(source, "teamAccess=${restriction.code}", anchor, insertion);

  return source;
});

patchFile("src/lib/players/add-player-without-duplicates.ts", (source) => {
  source = insertOnce(
    source,
    'getActivePlayingRestrictionForIdentity',
    'import { prisma } from "@/lib/prisma";\n',
    'import { getActivePlayingRestrictionForIdentity } from "@/lib/participation/controls";\n',
  );

  if (!source.includes('| "PLAYING_RESTRICTED";')) {
    source = source.replace(
      '    | "EMAIL_CONFLICT";',
      '    | "EMAIL_CONFLICT"\n    | "PLAYING_RESTRICTED";',
    );
  }

  const beforeTransaction = "  const normalisedPlayerName = normaliseName(displayName);\n\n  return prisma.$transaction";
  if (!source.includes("const activePlayingRestriction = await getActivePlayingRestrictionForIdentity")) {
    if (!source.includes(beforeTransaction)) {
      throw new Error("Participation player guard transaction anchor not found");
    }
    source = source.replace(
      beforeTransaction,
      `  const normalisedPlayerName = normaliseName(displayName);\n  const activePlayingRestriction = await getActivePlayingRestrictionForIdentity({\n    email,\n    phone,\n  });\n\n  return prisma.$transaction`,
    );
  }

  const guardAnchor = `    const sameTeamNameRows = (await tx.$queryRawUnsafe(`;
  const guardInsertion = `    if (activePlayingRestriction) {\n      return block(tx, input, {\n        ok: false,\n        code: "PLAYING_RESTRICTED",\n        message: activePlayingRestriction.until\n          ? \`This player is suspended from SIXFL until \${activePlayingRestriction.until.toLocaleDateString("en-GB")}. Ask SIXFL admin to review the restriction.\`\n          : "This player is currently suspended from SIXFL. Ask SIXFL admin to review the restriction.",\n        matchedType: "PLAYING_RESTRICTION",\n        matchedRecordId: activePlayingRestriction.userId,\n      });\n    }\n\n`;
  source = insertOnce(source, 'matchedType: "PLAYING_RESTRICTION"', guardAnchor, guardInsertion);

  return source;
});

patchFile("src/app/teams/join/[joinSlug]/actions.ts", (source) => {
  source = insertOnce(
    source,
    'from "@/lib/participation/controls"',
    'import { prisma } from "@/lib/prisma";\n',
    'import { getActivePlayingRestrictionForIdentity } from "@/lib/participation/controls";\n',
  );

  const anchor = `  const existing = await prisma.teamPlayerProspect.findFirst({`;
  const insertion = `  const activePlayingRestriction = await getActivePlayingRestrictionForIdentity({\n    email,\n    phone,\n  });\n\n  if (activePlayingRestriction) {\n    redirect(\n      buildRedirect(\n        joinSlug,\n        "?error=This%20player%20registration%20requires%20SIXFL%20admin%20review.",\n      ),\n    );\n  }\n\n`;
  source = insertOnce(source, "player%20registration%20requires%20SIXFL%20admin%20review", anchor, insertion);

  return source;
});

patchFile("src/app/(admin)/admin/teams/[id]/page.tsx", (source) => {
  const marker = "Participation controls";
  const anchor = `          <Link\n            href="/admin/teams"`;
  const insertion = `          <Link\n            href={\`/admin/participation-controls?q=\${encodeURIComponent(team.name)}\`}\n            className="inline-flex items-center justify-center rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-100 transition hover:bg-red-500/15"\n          >\n            Participation controls\n          </Link>\n\n`;
  return insertOnce(source, marker, anchor, insertion);
});

console.log("Participation control compatibility patches checked.");
