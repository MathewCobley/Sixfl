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

  source = replaceRequired(
    source,
    'import { queueSixflTvFixtureUploadedEmailsOnce } from "@/lib/sixfl-tv/notifications";',
    'import { queueSixflTvFixtureUploadedEmailsOnce } from "@/lib/sixfl-tv/notifications";\nimport GoalOfWeekAdminPanel from "@/components/admin/sixfl-tv/GoalOfWeekAdminPanel";',
    filePath,
  );

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

// The homepage is now native React. This compatibility script is deliberately
// limited to the admin page and must never rewrite public homepage source.
patchAdminPage();

console.log("Applied Goal of the Week admin integration.");
