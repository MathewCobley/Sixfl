const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

function write(filePath, source) {
  fs.writeFileSync(path.join(root, filePath), source, "utf8");
}

function replaceRequired(source, before, after, filePath) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected Goal of the Week source was not found in ${filePath}`);
  }
  return source.replace(before, after);
}

function patchAdminPage() {
  const filePath = "src/app/(admin)/admin/sixfl-tv/page.tsx";
  let source = read(filePath);

  const adminPanelImport =
    'import GoalOfWeekAdminPanel from "@/components/admin/sixfl-tv/GoalOfWeekAdminPanel";';
  if (!source.includes(adminPanelImport)) {
    source = replaceRequired(
      source,
      'import { queueSixflTvFixtureUploadedEmailsOnce } from "@/lib/sixfl-tv/notifications";',
      'import { queueSixflTvFixtureUploadedEmailsOnce } from "@/lib/sixfl-tv/notifications";\n' +
        adminPanelImport,
      filePath,
    );
  }

  source = replaceRequired(
    source,
    'searchParams?: Promise<{ saved?: string; error?: string }>;',
    'searchParams?: Promise<{ saved?: string; error?: string; goalSaved?: string; goalError?: string }>;',
    filePath,
  );

  source = replaceRequired(
    source,
    '    <div className="space-y-6">\n      <div className="rounded-3xl border border-fuchsia-400/20 bg-fuchsia-500/10 p-6">',
    '    <div className="space-y-6">\n      <GoalOfWeekAdminPanel searchParams={sp} />\n\n      <div className="rounded-3xl border border-fuchsia-400/20 bg-fuchsia-500/10 p-6">',
    filePath,
  );

  write(filePath, source);
}

function patchAdminPanel() {
  const filePath = "src/components/admin/sixfl-tv/GoalOfWeekAdminPanel.tsx";
  let source = read(filePath);

  const submitImport =
    'import GoalOfWeekSubmitButton from "@/components/admin/sixfl-tv/GoalOfWeekSubmitButton";';
  if (!source.includes(submitImport)) {
    source = replaceRequired(
      source,
      'import FormListboxField from "@/components/ui/FormListboxField";',
      `${submitImport}\nimport FormListboxField from "@/components/ui/FormListboxField";`,
      filePath,
    );
  }

  const saveStart = '  const publishedAt = publishNow ? new Date() : null;\n  const goalId = randomUUID();\n\n  try {';
  const saveEnd = '\n\n  revalidatePath("/");';
  const startIndex = source.indexOf(saveStart);
  const endIndex = source.indexOf(saveEnd, startIndex);

  if (startIndex !== -1 && endIndex !== -1) {
    const replacement = [
      '  let updatedExisting = false;',
      '',
      '  try {',
      '    await prisma.$transaction(async (tx) => {',
      '      // Serialise Goal of the Week writes so a rapid double click cannot create',
      '      // two copies of the same goal before the first request finishes.',
      '      await tx.$executeRaw(Prisma.sql`LOCK TABLE "GoalOfWeek" IN SHARE ROW EXCLUSIVE MODE`);',
      '',
      '      const matching = await tx.$queryRaw<Array<{ id: string; publishedAt: Date | null }>>(Prisma.sql`',
      '        SELECT "id", "publishedAt"',
      '        FROM "GoalOfWeek"',
      '        WHERE "videoUrl" = ${videoUrl}',
      '          AND "teamId" = ${team.id}',
      '          AND "weekOf" = ${weekOf}',
      '        ORDER BY "createdAt" DESC',
      '      `);',
      '      const existing = matching[0] ?? null;',
      '',
      '      if (publishNow) {',
      '        await tx.$executeRaw(Prisma.sql`',
      '          UPDATE "GoalOfWeek"',
      '          SET "isFeatured" = false, "updatedAt" = NOW()',
      '          WHERE "isFeatured" = true',
      '        `);',
      '      }',
      '',
      '      if (existing) {',
      '        updatedExisting = true;',
      '        await tx.$executeRaw(Prisma.sql`',
      '          UPDATE "GoalOfWeek"',
      '          SET',
      '            "playerName" = ${playerName},',
      '            "opponentName" = ${opponentName},',
      '            "caption" = ${caption},',
      '            "isFeatured" = ${publishNow},',
      '            "publishedAt" = CASE',
      '              WHEN ${publishNow} THEN COALESCE("publishedAt", NOW())',
      '              ELSE "publishedAt"',
      '            END,',
      '            "updatedAt" = NOW()',
      '          WHERE "id" = ${existing.id}',
      '        `);',
      '',
      '        // Earlier versions allowed repeated clicks to create exact duplicates.',
      '        // Collapse those exact duplicate records when this goal is saved again.',
      '        await tx.$executeRaw(Prisma.sql`',
      '          DELETE FROM "GoalOfWeek"',
      '          WHERE "videoUrl" = ${videoUrl}',
      '            AND "teamId" = ${team.id}',
      '            AND "weekOf" = ${weekOf}',
      '            AND "id" <> ${existing.id}',
      '        `);',
      '      } else {',
      '        const goalId = randomUUID();',
      '        await tx.$executeRaw(Prisma.sql`',
      '          INSERT INTO "GoalOfWeek" (',
      '            "id",',
      '            "videoUrl",',
      '            "teamId",',
      '            "playerName",',
      '            "opponentName",',
      '            "caption",',
      '            "weekOf",',
      '            "isFeatured",',
      '            "publishedAt",',
      '            "createdAt",',
      '            "updatedAt"',
      '          ) VALUES (',
      '            ${goalId},',
      '            ${videoUrl},',
      '            ${team.id},',
      '            ${playerName},',
      '            ${opponentName},',
      '            ${caption},',
      '            ${weekOf},',
      '            ${publishNow},',
      '            ${publishNow ? new Date() : null},',
      '            NOW(),',
      '            NOW()',
      '          )',
      '        `);',
      '      }',
      '    });',
      '  } catch (error) {',
      '    console.error("Failed to save Goal of the Week", error);',
      '    redirect("/admin/sixfl-tv?goalError=save#goal-of-week-admin");',
      '  }',
    ].join("\n");

    source = source.slice(0, startIndex) + replacement + source.slice(endIndex);
  } else if (!source.includes("updatedExisting = false")) {
    throw new Error(`Expected Goal of the Week save action was not found in ${filePath}`);
  }

  source = replaceRequired(
    source,
    '  revalidatePath("/api/public/goal-of-week");\n  redirect("/admin/sixfl-tv?goalSaved=created");',
    '  revalidatePath("/api/public/goal-of-week");\n  revalidatePath("/goal-of-week");\n  redirect(`/admin/sixfl-tv?goalSaved=${updatedExisting ? "updated" : "created"}#goal-of-week-admin`);',
    filePath,
  );

  source = replaceRequired(
    source,
    '  if (code === "created") return "Goal of the Week saved.";',
    '  if (code === "created") return "Goal of the Week saved and published.";\n  if (code === "updated") return "This Goal of the Week was already saved, so SIXFL updated the existing entry instead of creating another copy.";',
    filePath,
  );

  source = replaceRequired(
    source,
    '    <section className="overflow-hidden rounded-3xl border border-fuchsia-400/25',
    '    <section id="goal-of-week-admin" className="scroll-mt-6 overflow-hidden rounded-3xl border border-fuchsia-400/25',
    filePath,
  );

  const oldButton = `            <button\n              type="submit"\n              className="inline-flex min-h-12 items-center justify-center rounded-full bg-fuchsia-400 px-6 text-sm font-black text-black transition hover:bg-fuchsia-300"\n            >\n              Save Goal of the Week\n            </button>`;
  source = replaceRequired(
    source,
    oldButton,
    "            <GoalOfWeekSubmitButton />",
    filePath,
  );

  write(filePath, source);
}

// The homepage is now native React. This compatibility script is deliberately
// limited to admin source preparation and must never rewrite public homepage source.
patchAdminPage();
patchAdminPanel();

console.log("Applied Goal of the Week admin integration and save safeguards.");
