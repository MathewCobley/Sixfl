const fs = require("node:fs");
const path = require("node:path");

const file = "src/app/(admin)/admin/teams/[id]/prospects/actions.ts";
const target = path.join(process.cwd(), file);
let source = fs.readFileSync(target, "utf8");

const importBefore = 'import { prisma } from "@/lib/prisma";';
const importAfter = [
  'import { normalisePlayerIdentityName } from "@/lib/players/player-identity-safety";',
  importBefore,
].join("\n");
if (!source.includes(importAfter)) {
  if (!source.includes(importBefore)) throw new Error("Admin prospect Prisma import not found.");
  source = source.replace(importBefore, importAfter);
}

const marker = "export async function convertAdminProspectToMemberAction";
const functionIndex = source.indexOf(marker);
if (functionIndex < 0) throw new Error("Admin prospect promotion action not found.");

const accessBefore = "  await requireAdmin();";
const accessAfter = "  const access = await requireAdmin();";
const accessIndex = source.indexOf(accessBefore, functionIndex);
if (accessIndex >= 0) {
  source = source.slice(0, accessIndex) + accessAfter + source.slice(accessIndex + accessBefore.length);
} else if (!source.includes(accessAfter)) {
  throw new Error("Admin prospect access check not found.");
}

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
          _count: {
            select: { teamMembers: true, accounts: true, sessions: true },
          },
        },
      })
    : null;

  const prospectName = [prospect.firstName, prospect.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const prospectNameKey = normalisePlayerIdentityName(prospectName);
  const existingNameKey = normalisePlayerIdentityName(user?.name);
  const accountIsUsed = Boolean(
    user &&
      (user._count.teamMembers > 0 ||
        user._count.accounts > 0 ||
        user._count.sessions > 0),
  );
  const sharedEmailConflict = Boolean(
    user &&
      ((!existingNameKey && accountIsUsed) ||
        (existingNameKey && existingNameKey !== prospectNameKey)),
  );

  if (sharedEmailConflict && user && normalizedEmail) {
    const existingDisplayName = user.name?.trim() || "another existing player";
    const message = \`That email address is already the login for \${existingDisplayName}. It cannot be used for \${prospectName || "this player"}. Add a unique login email; neither player has been linked, renamed or merged.\`;

    await prisma.$executeRawUnsafe(
      'INSERT INTO "PlayerDuplicateAttempt" ("id", "teamId", "attemptedByUserId", "attemptedByEmail", "displayName", "email", "phone", "matchType", "matchedRecordId", "matchedTeamId", "reason", "createdAt") VALUES (md5(random()::text || clock_timestamp()::text || $1 || $2), $1, $3, $4, $5, $6, NULL, $7, $8, NULL, $9, NOW())',
      teamId,
      prospect.id,
      access.user?.id ?? null,
      access.user?.email ?? access.session?.user?.email ?? null,
      prospectName || normalizedEmail,
      normalizedEmail,
      "SHARED_EMAIL_DIFFERENT_PLAYER:ADMIN_PROMOTION",
      user.id,
      message,
    ).catch(() => undefined);

    redirect(buildRedirect(teamId, \`?error=\${encodeURIComponent(message)}\`));
  }

  const existingMembership = user`;

const lookupIndex = source.indexOf(before, functionIndex);
if (lookupIndex >= 0) {
  source = source.slice(0, lookupIndex) + after + source.slice(lookupIndex + before.length);
} else if (!source.includes("SHARED_EMAIL_DIFFERENT_PLAYER:ADMIN_PROMOTION")) {
  throw new Error("Admin prospect user lookup not found.");
}

fs.writeFileSync(target, source, "utf8");
if (!source.includes("SHARED_EMAIL_DIFFERENT_PLAYER:ADMIN_PROMOTION")) {
  throw new Error("Admin shared-email promotion guard was not applied.");
}
console.log("Admin prospect promotion now blocks shared-email identity collisions.");
