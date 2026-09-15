const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

function write(filePath, source) {
  fs.writeFileSync(path.join(root, filePath), source, "utf8");
}

function replaceOnce(filePath, before, after, label) {
  let source = read(filePath);

  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in ${filePath}`);
  }

  source = source.replace(before, after);
  write(filePath, source);
}

function removeOnce(filePath, before) {
  let source = read(filePath);
  if (!source.includes(before)) return;
  source = source.replace(before, "");
  write(filePath, source);
}

const captainFormPath = "src/components/captain/TeamKitOrderForm.tsx";
const captainPagePath = "src/app/captain/team/[teamid]/kit/page.tsx";
const captainActionsPath = "src/app/captain/team/[teamid]/kit/actions.ts";
const adminPagePath = "src/app/(admin)/admin/kits/page.tsx";
const adminActionsPath = "src/app/(admin)/admin/kits/actions.ts";
const kitDbPath = "src/lib/kits/db.ts";

removeOnce(captainFormPath, "  style: string | null;\n");

replaceOnce(
  captainFormPath,
  "      [design.code, design.name, design.primaryColour, design.secondaryColour, design.style]",
  "      [design.code, design.name, design.primaryColour, design.secondaryColour]",
  "captain kit search fields",
);

replaceOnce(
  captainFormPath,
  "                All available designs are shown below. Search by supplier code, colour or style to narrow the list.",
  "                All available designs are shown below. Search by supplier code or colour to narrow the list.",
  "captain kit search guidance",
);

removeOnce(captainPagePath, "            style: design.style,\n");
removeOnce(adminPagePath, "          design.style,\n");

replaceOnce(
  adminPagePath,
  '              placeholder="Search code, colour or style"',
  '              placeholder="Search code or colour"',
  "admin kit search placeholder",
);

removeOnce(
  adminPagePath,
  [
    '',
    '                  <label className="space-y-1.5">',
    '                    <span className="text-xs text-white/45">Style</span>',
    '                    <input',
    '                      name="style"',
    '                      defaultValue={design.style ?? ""}',
    '                      placeholder="Plain, striped, gradient…"',
    '                      className="h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-emerald-400/40"',
    '                    />',
    '                  </label>',
  ].join("\n"),
);

removeOnce(
  adminActionsPath,
  '      style: readString(formData, "style") || null,\n',
);

removeOnce(kitDbPath, "  style?: string | null;\n");
removeOnce(
  kitDbPath,
  '      "style" = ${cleanOptional(input.style)},\n',
);

removeOnce(captainActionsPath, "    kitStyle: input.design.style,\n");

const captainForm = read(captainFormPath);
const adminPage = read(adminPagePath);
const adminActions = read(adminActionsPath);
const kitDb = read(kitDbPath);

if (/design\.style|colour or style|\bstyle:\s*string/i.test(captainForm)) {
  throw new Error("Style remains in the captain kit picker.");
}

if (/name="style"|>Style<|design\.style|colour or style/i.test(adminPage)) {
  throw new Error("Style controls remain in the admin kit catalogue.");
}

if (/readString\(formData, "style"\)/.test(adminActions)) {
  throw new Error("Style is still processed by the admin action.");
}

if (/style\?:\s*string|input\.style/.test(kitDb)) {
  throw new Error("Style is still accepted by the kit metadata update function.");
}

if (!/secondaryColour/.test(captainForm) || !/name="secondaryColour"/.test(adminPage)) {
  throw new Error("Secondary colour must remain available.");
}

console.log(
  "Removed the Style field while keeping Primary colour and Secondary colour in the kit catalogue.",
);
