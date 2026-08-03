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

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  if (source.includes(replacement)) return source;
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Expected start of ${label} was not found.`);
  const endStart = source.indexOf(endMarker, start);
  if (endStart < 0) throw new Error(`Expected end of ${label} was not found.`);
  const end = endStart + endMarker.length;
  return source.slice(0, start) + replacement + source.slice(end);
}

function patchManagedJoinPage() {
  const file = "src/app/squad/join/[token]/page.tsx";
  let source = read(file);

  source = replaceRequired(
    source,
    'import { revalidatePath } from "next/cache";',
    'import { revalidatePath } from "next/cache";\nimport { redirect } from "next/navigation";',
    "managed join redirect import",
  );

  source = replaceRequired(
    source,
    'import { prisma } from "@/lib/prisma";',
    [
      'import { resolveProspectPlayerAccount } from "@/lib/players/player-identity-safety";',
      'import { prisma } from "@/lib/prisma";',
    ].join("\n"),
    "managed join player identity import",
  );

  source = replaceRequired(
    source,
    "  searchParams?: Promise<{ confirmed?: string }>;",
    "  searchParams?: Promise<{ confirmed?: string; accountPending?: string }> ;",
    "managed join account pending search param",
  );

  if (!source.includes('source: "SHARED_EMAIL_ACCOUNT_PENDING"')) {
    const transactionStart = "  await prisma.$transaction(async (tx) => {";
    const transactionEnd = "  });\n\n  revalidatePath(`/admin/teams/${prospectTeamId}`);";
    const replacement = [
      "  const linkResult = await prisma.$transaction(async (tx) => {",
      "    const accountResolution = await resolveProspectPlayerAccount({",
      "      client: tx,",
      "      teamId: prospectTeamId,",
      "      prospectId: prospect.id,",
      "      displayName: fullName,",
      "      email,",
      "      phone: prospect.phone,",
      '      source: "managed-squad-one-tap-join",',
      "    });",
      "",
      "    if (!accountResolution.ok) {",
      "      const conflictNote = [",
      "        prospect.notes?.trim(),",
      '        "Squad place confirmed, but the dashboard account was not linked because this contact email is already used by a differently named player. A unique login email is required.",',
      "      ]",
      "        .filter(Boolean)",
      '        .join("\\n");',
      "",
      "      await tx.teamPlayerProspect.update({",
      "        where: { id: prospect.id },",
      "        data: {",
      '          status: "ACTIVE_SQUAD",',
      '          source: "SHARED_EMAIL_ACCOUNT_PENDING",',
      "          notes: conflictNote,",
      "          lastContactedAt: new Date(),",
      "        },",
      "      });",
      "",
      "      return { ok: false as const };",
      "    }",
      "",
      "    const user = accountResolution.user;",
      "    const membership = await tx.teamMember.upsert({",
      "      where: {",
      "        userId_teamId: {",
      "          userId: user.id,",
      "          teamId: prospectTeamId,",
      "        },",
      "      },",
      "      update: {",
      '        role: "PLAYER",',
      "      },",
      "      create: {",
      "        userId: user.id,",
      "        teamId: prospectTeamId,",
      '        role: "PLAYER",',
      "      },",
      "      select: {",
      "        id: true,",
      "      },",
      "    });",
      "",
      "    await upsertTeamMemberProfileFromProspect({",
      "      client: tx,",
      "      teamMemberId: membership.id,",
      "      prospect: {",
      "        id: prospect.id,",
      "        phone: prospect.phone,",
      "        ageBand: prospect.ageBand,",
      "        preferredPositions: prospect.preferredPositions,",
      "        experienceSummary: prospect.experienceSummary,",
      "        availabilityLevel: prospect.availabilityLevel,",
      "        preferredNights: prospect.preferredNights,",
      "        availabilitySummary: prospect.availabilitySummary,",
      "        notes: prospect.notes,",
      "      },",
      "    });",
      "",
      "    await tx.teamPlayerProspect.update({",
      "      where: { id: prospect.id },",
      "      data: {",
      '        status: "ACTIVE_SQUAD",',
      '        source: "MANAGED_SQUAD_JOIN_CONFIRMED",',
      "        lastContactedAt: new Date(),",
      "      },",
      "    });",
      "",
      "    return { ok: true as const };",
      "  });",
      "",
      "  if (!linkResult.ok) {",
      "    redirect(",
      "      `/squad/join/${encodeURIComponent(token)}?confirmed=1&accountPending=shared-email`,",
      "    );",
      "  }",
      "",
      "  revalidatePath(`/admin/teams/${prospectTeamId}`);",
    ].join("\n");

    source = replaceBetween(
      source,
      transactionStart,
      transactionEnd,
      replacement,
      "managed join account-link transaction",
    );
  }

  source = replaceRequired(
    source,
    "      status: true,\n      teamId: true,",
    "      status: true,\n      source: true,\n      teamId: true,",
    "managed join prospect source field",
  );

  source = replaceRequired(
    source,
    [
      '  const isConfirmed = resolvedSearchParams.confirmed === "1" || prospect.status === "ACTIVE_SQUAD";',
      '  const isDeclined = prospect.status === "DECLINED";',
    ].join("\n"),
    [
      '  const accountPending =',
      '    resolvedSearchParams.accountPending === "shared-email" ||',
      '    prospect.source === "SHARED_EMAIL_ACCOUNT_PENDING";',
      '  const isConfirmed = resolvedSearchParams.confirmed === "1" || prospect.status === "ACTIVE_SQUAD";',
      '  const isDeclined = prospect.status === "DECLINED";',
    ].join("\n"),
    "managed join persistent shared-email state",
  );

  if (!source.includes("Your player record has been kept separate")) {
    source = replaceRequired(
      source,
      [
        "          ) : isConfirmed ? (",
        '            <div className="mt-6 space-y-4">',
        '              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-100/80">',
        "                You’re confirmed. We’ll send fixture availability messages when games are coming up.",
        "              </div>",
        "              <Link",
        "                href={`/player/team/${prospectTeamId}`}",
        '                className="inline-flex rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"',
        "              >",
        "                Go to team area",
        "              </Link>",
        "            </div>",
        "          ) : (",
      ].join("\n"),
      [
        "          ) : isConfirmed ? (",
        "            accountPending ? (",
        '              <div className="mt-6 rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100/85">',
        '                <div className="font-semibold text-white">Your player record has been kept separate.</div>',
        '                <p className="mt-2">',
        "                  Your squad place is confirmed, but this contact email is already the login for another player. SIXFL did not rename, link or merge either account. A separate login email is needed before dashboard access can be activated.",
        "                </p>",
        "              </div>",
        "            ) : (",
        '              <div className="mt-6 space-y-4">',
        '                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-100/80">',
        "                  You’re confirmed. We’ll send fixture availability messages when games are coming up.",
        "                </div>",
        "                <Link",
        "                  href={`/player/team/${prospectTeamId}`}",
        '                  className="inline-flex rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"',
        "                >",
        "                  Go to team area",
        "                </Link>",
        "              </div>",
        "            )",
        "          ) : (",
      ].join("\n"),
      "managed join shared-email explanation",
    );
  }

  write(file, source);
}

function patchActivationPage() {
  const file = "src/app/squad/activate/[token]/page.tsx";
  let source = read(file);

  source = replaceRequired(
    source,
    'import { prisma } from "@/lib/prisma";',
    [
      'import { resolveProspectPlayerAccount } from "@/lib/players/player-identity-safety";',
      'import { prisma } from "@/lib/prisma";',
    ].join("\n"),
    "activation player identity import",
  );

  if (!source.includes("This email already belongs to a different player account")) {
    const transactionStart = "  await prisma.$transaction(async (tx) => {";
    const transactionEnd = "  });\n\n  return (";
    const replacement = [
      "  const activationResult = await prisma.$transaction(async (tx) => {",
      "    const accountResolution = await resolveProspectPlayerAccount({",
      "      client: tx,",
      "      teamId: prospectTeamId,",
      "      prospectId: prospect.id,",
      "      displayName: prospectFullName || sessionEmail,",
      "      email: sessionEmail,",
      "      phone: prospect.phone,",
      "      requiredUserId: userId,",
      "      attemptedByUserId: userId,",
      "      attemptedByEmail: sessionEmail,",
      '      source: "signed-in-squad-activation",',
      "    });",
      "",
      "    if (!accountResolution.ok) {",
      "      await tx.teamPlayerProspect.update({",
      "        where: { id: prospect.id },",
      "        data: {",
      '          source: "SHARED_EMAIL_ACCOUNT_PENDING",',
      "          lastContactedAt: new Date(),",
      "        },",
      "      });",
      "      return { ok: false as const };",
      "    }",
      "",
      "    await removeDuplicatePlaceholderMemberForActivation({",
      "      client: tx,",
      "      teamId: prospectTeamId,",
      "      userId,",
      "      phone: prospect.phone,",
      "      name: prospectFullName,",
      "    });",
      "",
      "    const membership = await tx.teamMember.upsert({",
      "      where: {",
      "        userId_teamId: {",
      "          userId,",
      "          teamId: prospectTeamId,",
      "        },",
      "      },",
      "      update: {},",
      "      create: {",
      "        userId,",
      "        teamId: prospectTeamId,",
      '        role: "PLAYER",',
      "      },",
      "      select: { id: true },",
      "    });",
      "",
      "    await upsertTeamMemberProfileFromProspect({",
      "      client: tx,",
      "      teamMemberId: membership.id,",
      "      prospect: {",
      "        id: prospect.id,",
      "        phone: prospect.phone,",
      "        ageBand: prospect.ageBand,",
      "        preferredPositions: prospect.preferredPositions,",
      "        experienceSummary: prospect.experienceSummary,",
      "        availabilityLevel: prospect.availabilityLevel,",
      "        preferredNights: prospect.preferredNights,",
      "        availabilitySummary: prospect.availabilitySummary,",
      "        notes: prospect.notes,",
      "      },",
      "    });",
      "",
      "    await tx.teamPlayerProspect.update({",
      "      where: { id: prospect.id },",
      "      data: {",
      '        status: "ACTIVE_SQUAD",',
      '        source: "SQUAD_ACCOUNT_ACTIVATED",',
      "        lastContactedAt: new Date(),",
      "      },",
      "    });",
      "",
      "    return { ok: true as const };",
      "  });",
      "",
      "  if (!activationResult.ok) {",
      "    return (",
      '      <div className="min-h-screen bg-[#07130f] px-4 py-10 text-white">',
      '        <div className="mx-auto max-w-2xl rounded-3xl border border-amber-400/25 bg-amber-500/10 p-6">',
      '          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-100/80">',
      "            Player identity protected",
      "          </p>",
      '          <h1 className="mt-3 text-2xl font-semibold">This email already belongs to a different player account</h1>',
      '          <p className="mt-3 text-sm leading-6 text-amber-100/80">',
      "            SIXFL has not linked, renamed or merged either player. This squad place remains pending while a separate login email is arranged.",
      "          </p>",
      "        </div>",
      "      </div>",
      "    );",
      "  }",
      "",
      "  return (",
    ].join("\n");

    source = replaceBetween(
      source,
      transactionStart,
      transactionEnd,
      replacement,
      "signed-in activation account-link transaction",
    );
  }

  write(file, source);
}

function patchTeamMemberProfiles() {
  const file = "src/lib/teamMemberProfiles.ts";
  let source = read(file);

  if (!source.includes("A different player prospect is already linked to this squad membership")) {
    const start = "async function getSafeSourceProspectId(input: {";
    const end = "\n}\n\nexport async function upsertTeamMemberProfileFromProspect";
    const replacement = [
      "async function getSafeSourceProspectId(input: {",
      "  client: PrismaRawClientLike;",
      "  teamMemberId: string;",
      "  sourceProspectId: string;",
      "}) {",
      "  await ensureTeamMemberProfileTable(input.client);",
      "",
      "  const currentProfile = await input.client.$queryRaw<",
      "    Array<{ sourceProspectId: string | null }>",
      "  >`",
      '    SELECT "sourceProspectId"',
      '    FROM "TeamMemberProfile"',
      '    WHERE "teamMemberId" = ${input.teamMemberId}',
      "    LIMIT 1",
      "  `;",
      "  const currentSource = currentProfile[0]?.sourceProspectId ?? null;",
      "",
      "  if (currentSource && currentSource !== input.sourceProspectId) {",
      "    throw new Error(",
      '      "A different player prospect is already linked to this squad membership. SIXFL has blocked the update to prevent two players being merged.",',
      "    );",
      "  }",
      "",
      "  const existing = await input.client.$queryRaw<",
      "    Array<{ teamMemberId: string }>",
      "  >`",
      '    SELECT "teamMemberId"',
      '    FROM "TeamMemberProfile"',
      '    WHERE "sourceProspectId" = ${input.sourceProspectId}',
      "    LIMIT 1",
      "  `;",
      "",
      "  const existingTeamMemberId = existing[0]?.teamMemberId ?? null;",
      "",
      "  if (existingTeamMemberId && existingTeamMemberId !== input.teamMemberId) {",
      "    throw new Error(",
      '      "This player prospect is already linked to another squad membership. SIXFL has blocked the update to prevent identity loss.",',
      "    );",
      "  }",
      "",
      "  return input.sourceProspectId;",
      "}",
      "",
      "export async function upsertTeamMemberProfileFromProspect",
    ].join("\n");

    source = replaceBetween(
      source,
      start,
      end,
      replacement,
      "team member source prospect identity guard",
    );
  }

  write(file, source);
}

function patchPlaceholderRemoval() {
  const file = "src/lib/squad/duplicateGuard.ts";
  let source = read(file);

  source = replaceRequired(
    source,
    [
      "  userId: string;",
      "  phone?: string | null;",
      "}) {",
      "  const phone = normaliseDuplicatePhone(input.phone);",
      "  if (!phone) return null;",
    ].join("\n"),
    [
      "  userId: string;",
      "  phone?: string | null;",
      "  name?: string | null;",
      "}) {",
      "  const phone = normaliseDuplicatePhone(input.phone);",
      "  const candidateNameKey = getDuplicateNameKey({ name: input.name });",
      "  if (!phone || !candidateNameKey) return null;",
    ].join("\n"),
    "placeholder removal player name requirement",
  );

  source = replaceRequired(
    source,
    [
      "    if (![\"PLAYER\", \"BACKUP_PLAYER\"].includes(member.role)) return false;",
      "",
      "    return normaliseDuplicatePhone(member.phone) === phone;",
    ].join("\n"),
    [
      "    if (![\"PLAYER\", \"BACKUP_PLAYER\"].includes(member.role)) return false;",
      "",
      "    const memberNameKey = getDuplicateNameKey({ name: member.name });",
      "    return (",
      "      memberNameKey === candidateNameKey &&",
      "      normaliseDuplicatePhone(member.phone) === phone",
      "    );",
    ].join("\n"),
    "placeholder removal same-name check",
  );

  write(file, source);
}

function patchAddPlayerGuard() {
  const file = "src/lib/players/add-player-without-duplicates.ts";
  let source = read(file);

  source = replaceRequired(
    source,
    '    | "EMAIL_CONFLICT";',
    '    | "EMAIL_CONFLICT"\n    | "SHARED_EMAIL_DIFFERENT_PLAYER";',
    "add-player shared-email result code",
  );

  if (!source.includes("That email address is already the login for")) {
    const marker = [
      "    const phoneLinkedUsers = phoneDigits",
    ].join("\n");
    const block = [
      "    if (",
      "      emailUser?.name?.trim() &&",
      "      normaliseName(emailUser.name) !== normalisedPlayerName",
      "    ) {",
      "      return block(tx, input, {",
      "        ok: false,",
      '        code: "SHARED_EMAIL_DIFFERENT_PLAYER",',
      "        message:",
      '          `That email address is already the login for ${emailUser.name}. It cannot be used to identify ${displayName}. Use a separate login email; SIXFL has not merged or changed either player.`,',
      '        matchedType: "SHARED_EMAIL_DIFFERENT_PLAYER",',
      "        matchedRecordId: emailUser.id,",
      "      });",
      "    }",
      "",
      marker,
    ].join("\n");

    source = replaceRequired(
      source,
      marker,
      block,
      "add-player differently named shared-email block",
    );
  }

  write(file, source);
}

function patchPlayerMergeGuard() {
  const file = "src/lib/players/player-account-merge.ts";
  let source = read(file);

  source = replaceRequired(
    source,
    '         OR ($3::text IS NOT NULL AND LOWER(BTRIM(COALESCE(candidate."email", \'\'))) = $3)',
    [
      '         OR (',
      '           $3::text IS NOT NULL',
      '           AND LOWER(BTRIM(COALESCE(candidate."email", \'\'))) = $3',
      '           AND (',
      "             $2 = ''",
      "             OR LOWER(REGEXP_REPLACE(BTRIM(COALESCE(candidate.\"name\", '')), '[[:space:]]+', ' ', 'g')) = ''",
      "             OR LOWER(REGEXP_REPLACE(BTRIM(COALESCE(candidate.\"name\", '')), '[[:space:]]+', ' ', 'g')) = $2",
      '           )',
      '         )',
    ].join("\n"),
    "merge candidate shared-email name compatibility",
  );

  if (!source.includes("A shared email address is not proof that two differently named players are the same person")) {
    const marker = [
      '    if (keptUser.role === "ADMIN" || mergedUser.role === "ADMIN") {',
      '      throw new PlayerMergeConflictError("Administrator accounts cannot be merged as player duplicates.");',
      "    }",
    ].join("\n");
    const replacement = [
      marker,
      "",
      "    const keptNameKey = normalizeName(keptUser.name);",
      "    const mergedNameKey = normalizeName(mergedUser.name);",
      "    const keptEmailKey = normalizeEmail(keptUser.email);",
      "    const mergedEmailKey = normalizeEmail(mergedUser.email);",
      "    if (",
      "      keptEmailKey &&",
      "      mergedEmailKey &&",
      "      keptEmailKey === mergedEmailKey &&",
      "      keptNameKey &&",
      "      mergedNameKey &&",
      "      keptNameKey !== mergedNameKey",
      "    ) {",
      "      throw new PlayerMergeConflictError(",
      '        "A shared email address is not proof that two differently named players are the same person. Change the incorrect contact email or verify the identities separately; no merge has been made.",',
      "      );",
      "    }",
    ].join("\n");

    source = replaceRequired(
      source,
      marker,
      replacement,
      "server-side player merge shared-email guard",
    );
  }

  write(file, source);
}

function patchAuditExplanation() {
  const file = "src/app/(admin)/admin/players/audit/page.tsx";
  let source = read(file);

  source = replaceRequired(
    source,
    "  auditRows: MembershipAuditRow[];\n}): Cause {",
    "  auditRows: MembershipAuditRow[];\n  results: ResultRow[];\n}): Cause {",
    "audit cause result evidence input",
  );

  if (!source.includes("Only name-based match history survives")) {
    const marker = [
      "  if (latestAudit) {",
    ].join("\n");
    const block = [
      "  if (input.results.length > 0) {",
      "    return {",
      '      tone: "red",',
      '      title: "Only name-based match history survives",',
      "      explanation:",
      '        "The player appears in result or Player of the Match records, but no separate User, squad membership, prospect or PlayerPool identity remains. This is consistent with a legacy name-only player being folded into another account, including the old unsafe behaviour where two differently named players shared one login email.",',
      "      evidence: input.results.map(",
      "        (result) =>",
      "          `${result.teamName} vs ${result.opponentName} · ${formatDate(result.kickoffAt)} · Player of the Match ${result.playerOfMatchName || \"—\"}` ,",
      "      ),",
      "    };",
      "  }",
      "",
      marker,
    ].join("\n");
    source = replaceRequired(
      source,
      marker,
      block,
      "audit shared-email legacy explanation",
    );
  }

  source = replaceRequired(
    source,
    "        fees,\n        auditRows,\n      })",
    "        fees,\n        auditRows,\n        results,\n      })",
    "audit result evidence call",
  );

  write(file, source);
}

patchManagedJoinPage();
patchActivationPage();
patchTeamMemberProfiles();
patchPlaceholderRemoval();
patchAddPlayerGuard();
patchPlayerMergeGuard();
patchAuditExplanation();

const verification = [
  [
    "src/app/squad/join/[token]/page.tsx",
    ["resolveProspectPlayerAccount", "SHARED_EMAIL_ACCOUNT_PENDING"],
  ],
  [
    "src/app/squad/activate/[token]/page.tsx",
    ["resolveProspectPlayerAccount", "Player identity protected"],
  ],
  [
    "src/lib/teamMemberProfiles.ts",
    ["A different player prospect is already linked"],
  ],
  [
    "src/lib/squad/duplicateGuard.ts",
    ["candidateNameKey", "memberNameKey === candidateNameKey"],
  ],
  [
    "src/lib/players/add-player-without-duplicates.ts",
    ["SHARED_EMAIL_DIFFERENT_PLAYER"],
  ],
  [
    "src/lib/players/player-account-merge.ts",
    ["A shared email address is not proof"],
  ],
];

for (const [file, markers] of verification) {
  const source = read(file);
  for (const marker of markers) {
    if (!source.includes(marker)) {
      throw new Error(`${file} is missing shared-email safety marker: ${marker}`);
    }
  }
}

console.log(
  "Shared contact emails can no longer rename, reuse or merge differently named player accounts. Conflicts remain separate and require a unique login email.",
);
