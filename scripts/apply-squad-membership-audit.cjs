const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const write = (file, source) => fs.writeFileSync(path.join(root, file), source, "utf8");

const actionPath = "src/app/(admin)/admin/teams/[id]/squad/actions.ts";
let actions = read(actionPath);

const auditImport = 'import { recordSquadMembershipCreation } from "@/lib/admin/squadMembershipAudit";\n';
if (!actions.includes(auditImport)) {
  actions = actions.replace(
    'import { sendDashboardLoginEmail } from "@/lib/auth/sendDashboardLoginEmail";\n',
    auditImport + 'import { sendDashboardLoginEmail } from "@/lib/auth/sendDashboardLoginEmail";\n',
  );
}

actions = actions.replace(
  '  await requireAdmin();\n\n  const teamId = String(formData.get("teamId") ?? "").trim();',
  '  const { user: adminUser } = await requireAdmin();\n\n  const teamId = String(formData.get("teamId") ?? "").trim();',
);

const oldCreate = `  await prisma.teamMember.create({\n    data: {\n      teamId,\n      userId: user.id,\n      role,\n    },\n  });`;
const newCreate = `  const membership = await prisma.teamMember.create({\n    data: {\n      teamId,\n      userId: user.id,\n      role,\n    },\n    select: { id: true },\n  });\n\n  await recordSquadMembershipCreation({\n    teamMemberId: membership.id,\n    source: "ADMIN_SQUAD_CONSOLE",\n    createdByUserId: adminUser?.id ?? null,\n    detail: "Existing SIXFL account added from the admin squad console.",\n  });`;
if (actions.includes(oldCreate)) actions = actions.replace(oldCreate, newCreate);
write(actionPath, actions);

const detailsPath = "src/lib/admin/squadMemberCreationDetails.ts";
let details = read(detailsPath);
const detailsImport = 'import { getSquadMembershipAudits } from "@/lib/admin/squadMembershipAudit";\n';
if (!details.includes(detailsImport)) {
  details = details.replace(
    'import { prisma } from "@/lib/prisma";\n',
    detailsImport + 'import { prisma } from "@/lib/prisma";\n',
  );
}

const oldPromise = `  const [profiles, team, users, prospects] = await Promise.all([\n    getTeamMemberProfilesByTeamMemberIds(membershipIds),`;
const newPromise = `  const [profiles, creationAudits, team, users, prospects] = await Promise.all([\n    getTeamMemberProfilesByTeamMemberIds(membershipIds),\n    getSquadMembershipAudits(membershipIds),`;
if (details.includes(oldPromise)) details = details.replace(oldPromise, newPromise);

const loopMarker = `  for (const member of input.members) {\n    const prospectMatch = matchedProspectByMembershipId.get(member.id) ?? null;`;
const auditBlock = `  for (const member of input.members) {\n    const creationAudit = creationAudits.get(member.id) ?? null;\n    if (creationAudit) {\n      const creator = creationAudit.createdByUserId\n        ? await prisma.user.findUnique({\n            where: { id: creationAudit.createdByUserId },\n            select: { name: true, email: true },\n          })\n        : null;\n      const creatorName = actorLabel(creator);\n      const sourceLabels: Record<string, string> = {\n        ADMIN_SQUAD_CONSOLE: "Added through the admin squad console",\n        CAPTAIN_SQUAD: "Added by the team captain",\n        PLAYER_POOL: "Added from the Player Pool",\n        PROSPECT_ACTIVATION: "Activated from a player prospect",\n      };\n\n      result.set(member.id, {\n        method: sourceLabels[creationAudit.source] ?? creationAudit.source.replaceAll("_", " ").toLowerCase(),\n        createdBy: creatorName ?? "Creator account was not available",\n        detail: creationAudit.detail,\n        sourceRecordHref: creationAudit.sourceRecordId\n          ? "/admin/teams/" + input.teamId + "/prospects"\n          : null,\n        inferred: false,\n      });\n      continue;\n    }\n\n    const prospectMatch = matchedProspectByMembershipId.get(member.id) ?? null;`;
if (!details.includes("const creationAudit = creationAudits.get(member.id)")) {
  details = details.replace(loopMarker, auditBlock);
}

const oldFallback = `    result.set(member.id, {\n      method: "How this player was added is not recorded",\n      createdBy: "Creator cannot be identified from the available records",\n      detail:\n        "SIXFL does not have enough historic audit data to state how this squad membership was created.",\n      sourceRecordHref: null,\n      inferred: true,\n    });`;
const newFallback = `    const ageMs = Date.now() - member.createdAt.getTime();\n    const recent = ageMs >= 0 && ageMs < 30 * 24 * 60 * 60 * 1000;\n    result.set(member.id, {\n      method: recent\n        ? "Creation audit unexpectedly missing"\n        : "How this player was added is not recorded",\n      createdBy: "Creator cannot be identified from the available records",\n      detail: recent\n        ? "This is a recent membership, so its creation route should have recorded an audit entry. The missing entry indicates an untracked creation route rather than an historic record."\n        : "SIXFL does not have enough historic audit data to state how this squad membership was created.",\n      sourceRecordHref: null,\n      inferred: true,\n    });`;
if (details.includes(oldFallback)) details = details.replace(oldFallback, newFallback);
write(detailsPath, details);

console.log("Squad membership creation audit applied.");
