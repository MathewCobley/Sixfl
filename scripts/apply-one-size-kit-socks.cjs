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

function removeOnce(filePath, before, label) {
  let source = read(filePath);
  if (!source.includes(before)) return;
  source = source.replace(before, "");
  write(filePath, source);
}

const constantsPath = "src/lib/kits/constants.ts";
const formPath = "src/components/captain/TeamKitOrderForm.tsx";
const captainPagePath = "src/app/captain/team/[teamid]/kit/page.tsx";
const captainActionsPath = "src/app/captain/team/[teamid]/kit/actions.ts";
const adminPagePath = "src/app/(admin)/admin/kits/page.tsx";
const csvPath = "src/app/api/admin/kits/orders.csv/route.ts";

replaceOnce(
  constantsPath,
  [
    'export const TEAM_KIT_SOCK_SIZE_OPTIONS = [',
    '  { value: "MEDIUM_6_8", label: "Medium — shoe size 6–8" },',
    '  { value: "LARGE_8_PLUS", label: "Large — shoe size 8+" },',
    '] as const;',
    '',
    'export const TEAM_KIT_SIZE_GUIDE = [',
  ].join("\n"),
  [
    'export const TEAM_KIT_SOCK_SIZE_OPTIONS = [',
    '  { value: "MEDIUM_6_8", label: "Medium — shoe size 6–8" },',
    '  { value: "LARGE_8_PLUS", label: "Large — shoe size 8+" },',
    '] as const;',
    '',
    '// The supplier now provides one standard sock size. Keep a legacy enum value',
    '// internally so existing orders and the database column remain compatible.',
    'export const TEAM_KIT_FIXED_SOCK_SIZE = "LARGE_8_PLUS" as const;',
    '',
    'export const TEAM_KIT_SIZE_GUIDE = [',
  ].join("\n"),
  "fixed one-size sock constant",
);

replaceOnce(
  formPath,
  [
    'import {',
    '  TEAM_KIT_QUANTITY,',
    '  TEAM_KIT_SIZE_OPTIONS,',
    '  TEAM_KIT_SOCK_SIZE_OPTIONS,',
    '  getTeamKitSizeLabel,',
    '  getTeamKitSockSizeLabel,',
    '  type TeamKitSize,',
    '  type TeamKitSockSize,',
    '} from "@/lib/kits/constants";',
  ].join("\n"),
  [
    'import {',
    '  TEAM_KIT_QUANTITY,',
    '  TEAM_KIT_SIZE_OPTIONS,',
    '  getTeamKitSizeLabel,',
    '  type TeamKitSize,',
    '} from "@/lib/kits/constants";',
  ].join("\n"),
  "captain kit form imports",
);

removeOnce(formPath, '  sockSize: TeamKitSockSize;\n', "initial item sock size");
removeOnce(formPath, '  sockSize: TeamKitSockSize | "";\n', "row sock size");
removeOnce(
  formPath,
  'const sockSizeOptions = TEAM_KIT_SOCK_SIZE_OPTIONS.map((option) => ({ ...option }));\n',
  "sock size options",
);
removeOnce(formPath, '      sockSize: item?.sockSize ?? "",\n', "initial sock size value");
removeOnce(
  formPath,
  '  const sockSizeCounts = countValues(rows.map((row) => row.sockSize));\n',
  "sock size summary counts",
);

replaceOnce(
  formPath,
  '            Enter one row per kit. Shirt numbers must be unique. Leave the back name blank when a player only wants a number printed.',
  '            Enter one row per kit. Shirt numbers must be unique. Socks are included automatically in the standard size. Leave the back name blank when a player only wants a number printed.',
  "one-size socks explanatory copy",
);

replaceOnce(
  formPath,
  '              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">',
  '              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">',
  "three-column kit personalisation grid",
);

removeOnce(
  formPath,
  [
    '',
    '                <FormListboxField',
    '                  name={`sockSize_${row.position}`}',
    '                  label="Sock size"',
    '                  value={row.sockSize}',
    '                  options={sockSizeOptions}',
    '                  placeholder="Choose sock size"',
    '                  disabled={locked}',
    '                  onValueChange={(value) =>',
    '                    updateRow(row.position, { sockSize: value as TeamKitSockSize })',
    '                  }',
    '                />',
  ].join("\n"),
  "captain sock size selector",
);

removeOnce(
  formPath,
  [
    '',
    '            <div className="mt-4">',
    '              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">',
    '                Socks',
    '              </div>',
    '              <div className="mt-2 flex flex-wrap gap-2">',
    '                {sockSizeCounts.length ? (',
    '                  sockSizeCounts.map(([size, count]) => (',
    '                    <span',
    '                      key={size}',
    '                      className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/70"',
    '                    >',
    '                      {getTeamKitSockSizeLabel(size as TeamKitSockSize)} × {count}',
    '                    </span>',
    '                  ))',
    '                ) : (',
    '                  <span className="text-xs text-white/35">No sock sizes selected yet</span>',
    '                )}',
    '              </div>',
    '            </div>',
  ].join("\n"),
  "captain sock summary",
);

removeOnce(
  captainPagePath,
  [
    '',
    '  const sockSizeMatch = error.match(/^missing_sock_size_(\\d+)$/);',
    '  if (sockSizeMatch) return `Choose a sock size for kit ${sockSizeMatch[1]}.`;',
  ].join("\n"),
  "obsolete sock size validation message",
);

replaceOnce(
  captainPagePath,
  '              then enter the kit size, sock size, back name and shirt number for each player.',
  '              then enter the kit size, back name and shirt number for each player.',
  "captain kit introduction",
);

removeOnce(
  captainPagePath,
  [
    '',
    '          <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs text-white/50">',
    '            Socks: Medium 6–8 · Large 8+',
    '          </div>',
  ].join("\n"),
  "sock size guide pill",
);

replaceOnce(
  captainActionsPath,
  [
    'import {',
    '  TEAM_KIT_QUANTITY,',
    '  isTeamKitSize,',
    '  isTeamKitSockSize,',
    '} from "@/lib/kits/constants";',
  ].join("\n"),
  [
    'import {',
    '  TEAM_KIT_FIXED_SOCK_SIZE,',
    '  TEAM_KIT_QUANTITY,',
    '  isTeamKitSize,',
    '} from "@/lib/kits/constants";',
  ].join("\n"),
  "kit action fixed sock import",
);

removeOnce(
  captainActionsPath,
  '    const sockSize = readString(formData, `sockSize_${position}`);\n',
  "submitted sock size field",
);

removeOnce(
  captainActionsPath,
  [
    '',
    '    if (!isTeamKitSockSize(sockSize)) {',
    '      redirect(buildRedirect(teamId, { error: `missing_sock_size_${position}` }));',
    '    }',
  ].join("\n"),
  "sock size validation",
);

replaceOnce(
  captainActionsPath,
  '      sockSize,',
  '      sockSize: TEAM_KIT_FIXED_SOCK_SIZE,',
  "fixed sock size persistence",
);

replaceOnce(
  adminPagePath,
  [
    'import {',
    '  TEAM_KIT_QUANTITY,',
    '  getTeamKitSizeLabel,',
    '  getTeamKitSockSizeLabel,',
    '  getTeamKitStatusLabel,',
    '  type TeamKitOrderStatus,',
    '  type TeamKitSize,',
    '  type TeamKitSockSize,',
    '} from "@/lib/kits/constants";',
  ].join("\n"),
  [
    'import {',
    '  TEAM_KIT_QUANTITY,',
    '  getTeamKitSizeLabel,',
    '  getTeamKitStatusLabel,',
    '  type TeamKitOrderStatus,',
    '  type TeamKitSize,',
    '} from "@/lib/kits/constants";',
  ].join("\n"),
  "admin kit imports",
);

removeOnce(
  adminPagePath,
  '              const sockSizes = countValues(order.items.map((item) => item.sockSize));\n',
  "admin sock size counts",
);

removeOnce(
  adminPagePath,
  [
    '                        {sockSizes.map(([size, count]) => (',
    '                          <span',
    '                            key={`sock-${size}`}',
    '                            className="rounded-full border border-sky-400/15 bg-sky-500/[0.06] px-3 py-1 text-xs text-sky-100/75"',
    '                          >',
    '                            {getTeamKitSockSizeLabel(size as TeamKitSockSize)} × {count}',
    '                          </span>',
    '                        ))}',
  ].join("\n"),
  "admin sock size chips",
);

removeOnce(
  adminPagePath,
  '                              <th className="px-3 py-3 font-semibold">Socks</th>\n',
  "admin socks table header",
);
removeOnce(
  adminPagePath,
  '                                <td className="px-3 py-3">{getTeamKitSockSizeLabel(item.sockSize)}</td>\n',
  "admin socks table value",
);

replaceOnce(
  csvPath,
  [
    'import {',
    '  getTeamKitSizeLabel,',
    '  getTeamKitSockSizeLabel,',
    '  getTeamKitStatusLabel,',
    '} from "@/lib/kits/constants";',
  ].join("\n"),
  [
    'import {',
    '  getTeamKitSizeLabel,',
    '  getTeamKitStatusLabel,',
    '} from "@/lib/kits/constants";',
  ].join("\n"),
  "kit CSV imports",
);
removeOnce(csvPath, '    "Sock size",\n', "kit CSV sock header");
removeOnce(
  csvPath,
  '        getTeamKitSockSizeLabel(row.sockSize),\n',
  "kit CSV sock value",
);

const captainForm = read(formPath);
if (/sockSize|Sock size|sock size|sockSizeCounts/.test(captainForm)) {
  throw new Error("Sock-size controls remain in the captain kit form.");
}

console.log(
  "Removed sock-size choices from captain and admin kit screens; all new orders use the supplier's fixed standard sock size internally.",
);
