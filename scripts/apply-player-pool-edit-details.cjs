const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function patchFile(filePath, replacements) {
  const absolutePath = path.join(root, filePath);
  let source = fs.readFileSync(absolutePath, "utf8");

  for (const { before, after, label } of replacements) {
    if (source.includes(after)) continue;
    if (!source.includes(before)) {
      throw new Error(`Expected ${label} source was not found in ${filePath}`);
    }
    source = source.replace(before, after);
  }

  fs.writeFileSync(absolutePath, source, "utf8");
}

const playerPoolPagePath = "src/app/(admin)/admin/player-pool/page.tsx";
const deliveryIssuesPagePath = "src/app/(admin)/admin/delivery-issues/page.tsx";

patchFile(playerPoolPagePath, [
  {
    label: "PlayerPool detail update success messages",
    before: [
      '    case "status-updated":',
      '      return "PlayerPool status updated.";',
      '    case "deleted":',
    ].join("\n"),
    after: [
      '    case "status-updated":',
      '      return "PlayerPool status updated.";',
      '    case "details-updated":',
      '      return "PlayerPool contact details updated.";',
      '    case "details-updated-invite-sent":',
      '      return "PlayerPool contact details updated and a fresh profile invitation was queued.";',
      '    case "deleted":',
    ].join("\n"),
  },
  {
    label: "PlayerPool edit details link",
    before: [
      "                    <Link",
      "                      href={`/admin/player-prospects/${profile.prospectId}/communications`}",
      '                      className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-100 transition hover:bg-emerald-500/15"',
      "                    >",
      "                      Player comms",
      "                    </Link>",
    ].join("\n"),
    after: [
      "                    <Link",
      "                      href={`/admin/player-pool/${profile.id}/edit`}",
      '                      className="rounded-xl border border-sky-400/25 bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-100 transition hover:bg-sky-500/15"',
      "                    >",
      "                      Edit details",
      "                    </Link>",
      "                    <Link",
      "                      href={`/admin/player-prospects/${profile.prospectId}/communications`}",
      '                      className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-100 transition hover:bg-emerald-500/15"',
      "                    >",
      "                      Player comms",
      "                    </Link>",
    ].join("\n"),
  },
]);

patchFile(deliveryIssuesPagePath, [
  {
    label: "PlayerPool delivery issue source links",
    before: [
      "function sourceHref(sourceType: string, sourceId: string | null) {",
      "  if (!sourceId) return null;",
      '  if (sourceType === "TEAM") return `/admin/teams/${sourceId}`;',
    ].join("\n"),
    after: [
      "function sourceHref(sourceType: string, sourceId: string | null) {",
      "  if (!sourceId) return null;",
      '  if (sourceType === "GENERAL" && sourceId.startsWith("player-pool-profile:")) {',
      '    const profileId = sourceId.slice("player-pool-profile:".length);',
      '    return profileId ? `/admin/player-pool/${profileId}/edit` : "/admin/player-pool";',
      "  }",
      '  if (sourceType === "GENERAL" && sourceId.startsWith("team-prospect:")) {',
      '    const prospectId = sourceId.slice("team-prospect:".length);',
      '    return prospectId',
      '      ? `/admin/player-prospects/${prospectId}/communications`',
      '      : "/admin/player-prospects";',
      "  }",
      '  if (sourceType === "TEAM_PLAYER_PROSPECT") {',
      '    return `/admin/player-prospects/${sourceId}/communications`;',
      "  }",
      '  if (sourceType === "TEAM") return `/admin/teams/${sourceId}`;',
    ].join("\n"),
  },
]);

const playerPoolPage = fs.readFileSync(
  path.join(root, playerPoolPagePath),
  "utf8",
);
const deliveryIssuesPage = fs.readFileSync(
  path.join(root, deliveryIssuesPagePath),
  "utf8",
);

if (
  !playerPoolPage.includes("/admin/player-pool/${profile.id}/edit") ||
  !playerPoolPage.includes("details-updated-invite-sent")
) {
  throw new Error("PlayerPool edit details controls were not added correctly.");
}

if (
  !deliveryIssuesPage.includes('sourceId.startsWith("player-pool-profile:")') ||
  !deliveryIssuesPage.includes("/admin/player-pool/${profileId}/edit")
) {
  throw new Error("PlayerPool delivery issue links were not added correctly.");
}

require("./apply-player-duplicate-guard.cjs");
require("./apply-player-multi-team-badges.cjs");
require("./apply-player-merge-controls.cjs");
require("./apply-player-dashboard-temporary-fees-inline.cjs");
require("./apply-squad-member-creation-details.cjs");

console.log(
  "PlayerPool contact tools, duplicate-safe creation, multi-team badges, admin player merging, unified temporary-player fees and squad creator details are enabled.",
);
