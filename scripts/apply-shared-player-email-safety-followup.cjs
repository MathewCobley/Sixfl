const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function absolute(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  return fs.readFileSync(absolute(relativePath), "utf8");
}

function write(relativePath, source) {
  fs.writeFileSync(absolute(relativePath), source, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  return source.replace(before, after);
}

function replaceFromMarkerToEnd(source, marker, replacement, label) {
  if (source.includes(replacement)) return source;
  const start = source.indexOf(marker);
  if (start < 0) {
    throw new Error(`Expected ${label} marker was not found.`);
  }
  return `${source.slice(0, start)}${replacement}\n`;
}

function patchAdminProspectPromotion() {
  const file = "src/app/(admin)/admin/teams/[id]/prospects/actions.ts";
  let source = read(file);

  source = replaceRequired(
    source,
    'import { prisma } from "@/lib/prisma";',
    [
      'import { promoteProspectToTeamMember } from "@/lib/players/promote-prospect-to-member";',
      'import { prisma } from "@/lib/prisma";',
    ].join("\n"),
    "admin prospect promotion safety import",
  );

  const replacement = `export async function convertAdminProspectToMemberAction(formData: FormData) {
  const access = await requireAdmin();

  const teamId = String(formData.get("teamId") ?? "").trim();
  const prospectId = String(formData.get("prospectId") ?? "").trim();

  if (!teamId || !prospectId) {
    redirect("/admin/teams");
  }

  const result = await promoteProspectToTeamMember({
    teamId,
    prospectId,
    attemptedByUserId: access.user?.id ?? null,
    attemptedByEmail: access.user?.email ?? access.session?.user?.email ?? null,
    source: "ADMIN_PROSPECT_PROMOTED",
  });

  revalidatePath(\`/admin/teams/\${teamId}\`);
  revalidatePath(\`/admin/teams/\${teamId}/squad\`);
  revalidatePath(\`/admin/teams/\${teamId}/prospects\`);
  revalidatePath(\`/captain/team/\${teamId}/squad\`);
  revalidatePath(\`/captain/team/\${teamId}/prospects\`);
  revalidatePath("/admin/player-prospects");

  if (!result.ok) {
    redirect(
      buildRedirect(
        teamId,
        \`?error=\${encodeURIComponent(result.message)}\`,
      ),
    );
  }

  if (result.status === "pending_email") {
    redirect(buildRedirect(teamId, "?saved=promoted-pending-email"));
  }

  redirect(buildRedirect(teamId, "?saved=promoted"));
}`;

  source = replaceFromMarkerToEnd(
    source,
    "export async function convertAdminProspectToMemberAction",
    replacement,
    "admin prospect promotion function",
  );

  write(file, source);
}

function patchCaptainProspectPromotion() {
  const file = "src/app/captain/team/[teamid]/prospects/actions.ts";
  let source = read(file);

  source = replaceRequired(
    source,
    'import { prisma } from "@/lib/prisma";',
    [
      'import { promoteProspectToTeamMember } from "@/lib/players/promote-prospect-to-member";',
      'import { prisma } from "@/lib/prisma";',
    ].join("\n"),
    "captain prospect promotion safety import",
  );

  const replacement = `export async function convertProspectToMemberAction(formData: FormData) {
  const teamid = String(formData.get("teamid") ?? "").trim();
  const prospectId = String(formData.get("prospectId") ?? "").trim();

  const access = await requireCaptain(teamid);

  if (!teamid || !prospectId) {
    redirect("/captain");
  }

  const result = await promoteProspectToTeamMember({
    teamId: teamid,
    prospectId,
    attemptedByUserId: access.user?.id ?? null,
    attemptedByEmail: access.user?.email ?? access.session?.user?.email ?? null,
    source: "CAPTAIN_PROSPECT_PROMOTED",
  });

  revalidatePath(\`/captain/team/\${teamid}/squad\`);
  revalidatePath(\`/captain/team/\${teamid}/prospects\`);
  revalidatePath(\`/admin/teams/\${teamid}/squad\`);
  revalidatePath(\`/admin/teams/\${teamid}/prospects\`);
  revalidatePath("/admin/player-prospects");

  if (!result.ok) {
    redirect(
      buildProspectsRedirect(
        teamid,
        \`?error=\${encodeURIComponent(result.message)}\`,
      ),
    );
  }

  if (result.status === "pending_email") {
    redirect(
      buildProspectsRedirect(teamid, "?saved=promoted-pending-email"),
    );
  }

  redirect(buildProspectsRedirect(teamid, "?saved=promoted"));
}`;

  source = replaceFromMarkerToEnd(
    source,
    "export async function convertProspectToMemberAction",
    replacement,
    "captain prospect promotion function",
  );

  write(file, source);
}

function patchMergeIdentityRequirement() {
  const file = "src/lib/players/player-account-merge.ts";
  let source = read(file);

  source = replaceRequired(
    source,
    `  const candidates = (
    await Promise.all(candidateRows.map((row) => loadAccountSummary(row.id)))
  ).filter((value): value is PlayerMergeAccountSummary => Boolean(value));`,
    `  const candidates = (
    await Promise.all(candidateRows.map((row) => loadAccountSummary(row.id)))
  )
    .filter((value): value is PlayerMergeAccountSummary => Boolean(value))
    .filter((candidate) => {
      const candidateName = normalizeName(candidate.name);
      return !normalizedName || !candidateName || candidateName === normalizedName;
    });`,
    "merge preview same-name filter",
  );

  if (!source.includes("Player account merges require matching player names")) {
    const marker = `    const keptEmailKey = normalizeEmail(keptUser.email);`;
    const block = `    if (
      keptNameKey &&
      mergedNameKey &&
      keptNameKey !== mergedNameKey
    ) {
      throw new PlayerMergeConflictError(
        "Player account merges require matching player names. A shared email address or mobile number is only contact information and cannot be used as proof that two differently named people are the same player.",
      );
    }

${marker}`;

    source = replaceRequired(
      source,
      marker,
      block,
      "server-side matching-name merge requirement",
    );
  }

  write(file, source);
}

patchAdminProspectPromotion();
patchCaptainProspectPromotion();
patchMergeIdentityRequirement();

const verification = [
  [
    "src/app/(admin)/admin/teams/[id]/prospects/actions.ts",
    ["promoteProspectToTeamMember", "ADMIN_PROSPECT_PROMOTED"],
  ],
  [
    "src/app/captain/team/[teamid]/prospects/actions.ts",
    ["promoteProspectToTeamMember", "CAPTAIN_PROSPECT_PROMOTED"],
  ],
  [
    "src/lib/players/player-account-merge.ts",
    [
      "Player account merges require matching player names",
      "candidateName === normalizedName",
    ],
  ],
];

for (const [file, markers] of verification) {
  const source = read(file);
  for (const marker of markers) {
    if (!source.includes(marker)) {
      throw new Error(`${file} is missing shared-email follow-up marker: ${marker}`);
    }
  }
}

console.log(
  "Admin and captain promotions now use the shared-email identity guard, and differently named accounts cannot be merged through email or phone matches.",
);
