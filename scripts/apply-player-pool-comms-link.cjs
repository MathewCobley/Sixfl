const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pagePath = "src/app/(admin)/admin/player-pool/page.tsx";
const absolutePath = path.join(root, pagePath);
let source = fs.readFileSync(absolutePath, "utf8");

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in ${pagePath}`);
  }
  source = source.replace(before, after);
}

replaceOnce(
  [
    "type ProfileRow = {",
    "  id: string;",
    "  leadId: string | null;",
  ].join("\n"),
  [
    "type ProfileRow = {",
    "  id: string;",
    "  prospectId: string;",
    "  leadId: string | null;",
  ].join("\n"),
  "PlayerPool profile prospect id type",
);

replaceOnce(
  [
    "      SELECT",
    '        profile."id",',
    '        profile."leadId",',
  ].join("\n"),
  [
    "      SELECT",
    '        profile."id",',
    '        profile."prospectId",',
    '        profile."leadId",',
  ].join("\n"),
  "PlayerPool profile prospect id query",
);

replaceOnce(
  [
    "                  <Link",
    "                    href={`/player-pool/profile/${profile.profileToken}`}",
    '                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/70 transition hover:bg-white/10"',
    "                  >",
    "                    Open form",
    "                  </Link>",
  ].join("\n"),
  [
    '                  <div className="flex flex-wrap justify-end gap-2">',
    "                    <Link",
    "                      href={`/admin/player-prospects/${profile.prospectId}/communications`}",
    '                      className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-100 transition hover:bg-emerald-500/15"',
    "                    >",
    "                      Player comms",
    "                    </Link>",
    "                    <Link",
    "                      href={`/player-pool/profile/${profile.profileToken}`}",
    '                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/70 transition hover:bg-white/10"',
    "                    >",
    "                      Open form",
    "                    </Link>",
    "                  </div>",
  ].join("\n"),
  "PlayerPool card communications link",
);

if (
  !source.includes('profile."prospectId"') ||
  !source.includes("/admin/player-prospects/${profile.prospectId}/communications") ||
  !source.includes("Player comms")
) {
  throw new Error("PlayerPool communications link was not added correctly.");
}

fs.writeFileSync(absolutePath, source, "utf8");
console.log(
  "PlayerPool profile cards now link directly to each player prospect communication hub.",
);
