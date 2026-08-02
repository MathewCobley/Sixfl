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

function replaceAfterMarker(filePath, marker, before, after, label) {
  let source = read(filePath);
  if (source.includes(after)) return;
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Missing marker for ${label}.`);
  const targetIndex = source.indexOf(before, markerIndex);
  if (targetIndex < 0) throw new Error(`Missing ${label} target.`);
  source =
    source.slice(0, targetIndex) +
    after +
    source.slice(targetIndex + before.length);
  write(filePath, source);
}

const pagePath = "src/app/captain/team/[teamid]/availability/page.tsx";
const actionPath = "src/app/captain/team/[teamid]/availability/actions.ts";
const chaseMarker =
  "export async function sendAvailabilitySmsChaseAction(formData: FormData)";

replaceOnce(
  pagePath,
  [
    "  const since = new Date();",
    "  since.setDate(since.getDate() - 30);",
    "",
    "  const fixtures = await prisma.fixture.findMany({",
    "    where: {",
    "      ...publishedFixtureWhere,",
    "      OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],",
    "      kickoffAt: { gte: since },",
    '      status: { in: ["SCHEDULED", "POSTPONED"] },',
    "    },",
  ].join("\n"),
  [
    "  const now = new Date();",
    "  const since = new Date(now);",
    "  since.setDate(since.getDate() - 30);",
    "",
    "  const fixtures = await prisma.fixture.findMany({",
    "    where: {",
    "      ...publishedFixtureWhere,",
    "      AND: [",
    "        { OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }] },",
    "        {",
    "          OR: [",
    '            { status: "SCHEDULED", kickoffAt: { gt: now } },',
    '            { status: "POSTPONED", kickoffAt: { gte: since } },',
    "          ],",
    "        },",
    "      ],",
    "    },",
  ].join("\n"),
  "future availability fixture filter",
);

replaceOnce(
  pagePath,
  [
    "                  const smsDispatch = smsDispatchBySourceId.get(",
    "                    getSmsSourceId({",
    "                      fixtureId: fixture.id,",
    "                      teamMemberId: member.id,",
    "                    }),",
    "                  );",
    "",
    "                  return (",
  ].join("\n"),
  [
    "                  const smsDispatch = smsDispatchBySourceId.get(",
    "                    getSmsSourceId({",
    "                      fixtureId: fixture.id,",
    "                      teamMemberId: member.id,",
    "                    }),",
    "                  );",
    "                  const canChaseBySms =",
    "                    Boolean(memberPhone) &&",
    '                    fixture.status === "SCHEDULED" &&',
    "                    fixture.kickoffAt.getTime() > now.getTime() &&",
    '                    response === "NO_RESPONSE";',
    "                  const chaseButtonLabel = !memberPhone",
    '                    ? "No phone to chase"',
    '                    : response !== "NO_RESPONSE"',
    '                      ? "Player has replied"',
    '                      : fixture.status !== "SCHEDULED"',
    '                        ? "Fixture postponed"',
    "                        : fixture.kickoffAt.getTime() <= now.getTime()",
    '                          ? "Fixture has passed"',
    '                          : "Chase by SMS";',
    "",
    "                  return (",
  ].join("\n"),
  "per-player chase eligibility",
);

replaceOnce(
  pagePath,
  [
    "                              <button",
    '                                type="submit"',
    "                                disabled={!memberPhone}",
    '                                className="inline-flex w-full items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2.5 text-sm font-medium text-sky-100 transition hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-white/35"',
    "                              >",
    '                                {memberPhone ? "Chase by SMS" : "No phone to chase"}',
    "                              </button>",
  ].join("\n"),
  [
    "                              <button",
    '                                type="submit"',
    "                                disabled={!canChaseBySms}",
    '                                className="inline-flex w-full items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2.5 text-sm font-medium text-sky-100 transition hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-white/35"',
    "                              >",
    "                                {chaseButtonLabel}",
    "                              </button>",
  ].join("\n"),
  "safe chase button",
);

replaceAfterMarker(
  actionPath,
  chaseMarker,
  [
    "    where: {",
    "      id: fixtureId,",
    "      ...publishedFixtureWhere,",
    "      OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],",
    "    },",
  ].join("\n"),
  [
    "    where: {",
    "      id: fixtureId,",
    "      ...publishedFixtureWhere,",
    '      status: "SCHEDULED",',
    "      kickoffAt: { gt: new Date() },",
    "      OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],",
    "    },",
  ].join("\n"),
  "server-side future fixture check",
);

replaceAfterMarker(
  actionPath,
  chaseMarker,
  [
    "  if (!fixture || !member) {",
    "    redirect(",
    "      buildAvailabilityRedirect(",
    "        teamid,",
    '        "?error=Fixture%20or%20player%20not%20found.",',
    "      ),",
    "    );",
    "  }",
  ].join("\n"),
  [
    "  if (!fixture || !member) {",
    "    redirect(",
    "      buildAvailabilityRedirect(",
    "        teamid,",
    '        "?error=This%20fixture%20has%20passed%2C%20is%20postponed%2C%20or%20is%20no%20longer%20available%20to%20chase.",',
    "      ),",
    "    );",
    "  }",
  ].join("\n"),
  "clear stale chase error",
);

const page = read(pagePath);
const actions = read(actionPath);
if (
  !page.includes("disabled={!canChaseBySms}") ||
  !page.includes('{ status: "SCHEDULED", kickoffAt: { gt: now } }') ||
  !actions.includes("kickoffAt: { gt: new Date() }")
) {
  throw new Error("Past-fixture availability chase guard was not fully applied.");
}

console.log(
  "Availability SMS chases are now limited to unanswered players on future scheduled fixtures.",
);
