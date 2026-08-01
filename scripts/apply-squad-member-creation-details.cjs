const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(
  process.cwd(),
  "src/app/(admin)/admin/teams/[id]/squad/page.tsx",
);
let source = fs.readFileSync(filePath, "utf8");

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  source = source.replace(before, after);
}

replaceOnce(
  'import { formatDateTimeInLondon } from "@/lib/datetime/london";',
  [
    'import { getSquadMemberCreationDetailsMap } from "@/lib/admin/squadMemberCreationDetails";',
    'import { formatDateTimeInLondon } from "@/lib/datetime/london";',
  ].join("\n"),
  "squad creation-details import",
);

replaceOnce(
  "  const loginStatusByMembershipId = await getSquadLoginStatusMap(team.id);",
  [
    "  const loginStatusByMembershipId = await getSquadLoginStatusMap(team.id);",
    "  const creationDetailsByMembershipId =",
    "    await getSquadMemberCreationDetailsMap({",
    "      teamId: team.id,",
    "      members: team.members,",
    "    });",
  ].join("\n"),
  "squad creation-details query",
);

replaceOnce(
  [
    "                const dashboardStatus = loginStatusByMembershipId.get(member.id);",
    "                const dashboardCopy = getDashboardStatusCopy(dashboardStatus);",
  ].join("\n"),
  [
    "                const dashboardStatus = loginStatusByMembershipId.get(member.id);",
    "                const dashboardCopy = getDashboardStatusCopy(dashboardStatus);",
    "                const creationDetails = creationDetailsByMembershipId.get(member.id);",
  ].join("\n"),
  "member creation-details lookup",
);

replaceOnce(
  [
    '                        <div className="mt-1 text-xs text-white/45">',
    "                          Added {formatUkDateTime(member.createdAt)}",
    "                        </div>",
    "",
    '                        <div className={`mt-3 rounded-xl border px-3 py-2 text-xs leading-5 ${dashboardCopy.className}`}>',
  ].join("\n"),
  [
    '                        <div className="mt-1 text-xs text-white/45">',
    "                          Added {formatUkDateTime(member.createdAt)}",
    "                        </div>",
    "",
    "                        {creationDetails ? (",
    '                          <div className="mt-3 rounded-xl border border-sky-400/20 bg-sky-500/[0.07] px-3 py-2.5 text-xs leading-5 text-sky-50/80">',
    '                            <div className="font-semibold text-sky-100">',
    "                              How this squad place was created",
    "                            </div>",
    '                            <div className="mt-1">',
    '                              <span className="text-white/45">Method:</span>{" "}',
    "                              {creationDetails.method}",
    "                            </div>",
    "                            <div>",
    '                              <span className="text-white/45">By:</span>{" "}',
    "                              {creationDetails.createdBy}",
    "                            </div>",
    "                            {creationDetails.detail ? (",
    '                              <div className="mt-1 text-white/50">',
    "                                {creationDetails.detail}",
    "                              </div>",
    "                            ) : null}",
    "                            {creationDetails.sourceRecordHref ? (",
    "                              <Link",
    "                                href={creationDetails.sourceRecordHref}",
    '                                className="mt-1 inline-flex font-semibold text-sky-200 underline decoration-sky-400/40 underline-offset-4 hover:text-sky-100"',
    "                              >",
    "                                Open source record",
    "                              </Link>",
    "                            ) : null}",
    "                          </div>",
    "                        ) : null}",
    "",
    '                        <div className={`mt-3 rounded-xl border px-3 py-2 text-xs leading-5 ${dashboardCopy.className}`}>',
  ].join("\n"),
  "member creation-details panel",
);

fs.writeFileSync(filePath, source, "utf8");
console.log("Added squad member creation method and creator details to the admin squad console.");
