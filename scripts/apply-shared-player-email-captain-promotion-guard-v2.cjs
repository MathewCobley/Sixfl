const fs = require("node:fs");
const path = require("node:path");

const target = path.join(
  process.cwd(),
  "src/app/captain/team/[teamid]/prospects/actions.ts",
);
let source = fs.readFileSync(target, "utf8");

const importBefore = 'import { prisma } from "@/lib/prisma";';
const importAfter = [
  'import { normalisePlayerIdentityName } from "@/lib/players/player-identity-safety";',
  importBefore,
].join("\n");
if (!source.includes(importAfter)) {
  if (!source.includes(importBefore)) throw new Error("Captain prospect Prisma import not found.");
  source = source.replace(importBefore, importAfter);
}

const marker = "export async function convertProspectToMemberAction";
const functionIndex = source.indexOf(marker);
if (functionIndex < 0) throw new Error("Captain prospect promotion action not found.");

const before = `  const user = normalizedEmail
    ? await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: {
          id: true,
          email: true,
        },
      })
    : null;

  const existingMembership = user`;

const after = `  const user = normalizedEmail
    ? await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: {
          id: true,
          email: true,
          name: true,
        },
      })
    : null;

  const prospectName = [prospect.firstName, prospect.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const prospectNameKey = normalisePlayerIdentityName(prospectName);
  const existingNameKey = normalisePlayerIdentityName(user?.name);

  if (
    user &&
    normalizedEmail &&
    existingNameKey &&
    existingNameKey !== prospectNameKey
  ) {
    const existingDisplayName = user.name?.trim() || "another existing player";
    const message = \`That email address is already the login for \${existingDisplayName}. It cannot be used for \${prospectName || "this player"}. Add a unique login email; neither player has been linked, renamed or merged.\`;

    await prisma.$executeRawUnsafe(
      'INSERT INTO "PlayerDuplicateAttempt" ("id", "teamId", "attemptedByUserId", "attemptedByEmail", "displayName", "email", "phone", "matchType", "matchedRecordId", "matchedTeamId", "reason", "createdAt") VALUES (md5(random()::text || clock_timestamp()::text || $1 || $2), $1, NULL, NULL, $3, $4, NULL, $5, $6, NULL, $7, NOW())',
      teamid,
      prospect.id,
      prospectName || normalizedEmail,
      normalizedEmail,
      "SHARED_EMAIL_DIFFERENT_PLAYER:CAPTAIN_PROMOTION",
      user.id,
      message,
    ).catch(() => undefined);

    redirect(
      buildProspectsRedirect(
        teamid,
        \`?error=\${encodeURIComponent(message)}\`,
      ),
    );
  }

  const existingMembership = user`;

const lookupIndex = source.indexOf(before, functionIndex);
if (lookupIndex >= 0) {
  source = source.slice(0, lookupIndex) + after + source.slice(lookupIndex + before.length);
} else if (!source.includes("SHARED_EMAIL_DIFFERENT_PLAYER:CAPTAIN_PROMOTION")) {
  throw new Error("Captain prospect user lookup not found.");
}

fs.writeFileSync(target, source, "utf8");
if (!source.includes("SHARED_EMAIL_DIFFERENT_PLAYER:CAPTAIN_PROMOTION")) {
  throw new Error("Captain shared-email promotion guard was not applied.");
}
console.log("Captain prospect promotion now blocks differently named shared-email accounts.");
