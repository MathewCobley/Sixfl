const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(
  process.cwd(),
  "src/app/player/team/[teamid]/page.tsx",
);
let source = fs.readFileSync(pagePath, "utf8");

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in player dashboard.`);
  }
  source = source.replace(before, after);
}

if (!source.includes("  Prisma,")) {
  replaceRequired(
    "  FixtureStatus,\n",
    "  FixtureStatus,\n  Prisma,\n",
    "Prisma import",
  );
}

if (!source.includes('from "@/lib/kits/constants"')) {
  replaceRequired(
    'import { formatDateTimeInLondon } from "@/lib/datetime/london";',
    [
      'import { formatDateTimeInLondon } from "@/lib/datetime/london";',
      'import { getTeamKitSizeLabel, type TeamKitSize } from "@/lib/kits/constants";',
    ].join("\n"),
    "kit size label import",
  );
}

const kitQuery = [
  "  const kitAssignmentRows = membership",
  "    ? await prisma.$queryRaw<",
  "        Array<{",
  "          id: string;",
  "          token: string;",
  "          position: number;",
  "          status: string;",
  "          backName: string | null;",
  "          shirtNumber: number | null;",
  "          kitSize: TeamKitSize | null;",
  "          lastSentAt: Date | null;",
  "          openedAt: Date | null;",
  "          completedAt: Date | null;",
  "          orderStatus: string | null;",
  "        }>",
  "      >(Prisma.sql`",
  "        SELECT",
  "          assignment.\"id\",",
  "          assignment.\"token\",",
  "          assignment.\"position\",",
  "          assignment.\"status\",",
  "          assignment.\"backName\",",
  "          assignment.\"shirtNumber\",",
  "          assignment.\"kitSize\"::text AS \"kitSize\",",
  "          assignment.\"lastSentAt\",",
  "          assignment.\"openedAt\",",
  "          assignment.\"completedAt\",",
  "          orders.\"status\"::text AS \"orderStatus\"",
  "        FROM \"TeamKitPlayerAssignment\" assignment",
  "        LEFT JOIN \"TeamKitOrder\" orders",
  "          ON orders.\"teamId\" = assignment.\"teamId\"",
  "        WHERE assignment.\"teamId\" = ${teamid}",
  "          AND assignment.\"teamMemberId\" = ${membership.id}",
  "        ORDER BY assignment.\"updatedAt\" DESC",
  "        LIMIT 1",
  "      `)",
  "    : [];",
  "  const kitAssignment = kitAssignmentRows[0] ?? null;",
  "  const kitOrderLocked = Boolean(",
  "    kitAssignment?.orderStatus && kitAssignment.orderStatus !== \"DRAFT\",",
  "  );",
  "",
].join("\n");

if (!source.includes("const kitAssignmentRows = membership")) {
  replaceRequired(
    "  const openFees = playerFees.filter((fee) => fee.status === PlayerMatchFeeStatus.OPEN);",
    kitQuery +
      "  const openFees = playerFees.filter((fee) => fee.status === PlayerMatchFeeStatus.OPEN);",
    "player kit assignment query",
  );
}

const card = [
  "        <section className=\"rounded-3xl border border-violet-400/20 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.14),transparent_38%),rgba(255,255,255,0.035)] p-6\">",
  "          <div className=\"flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between\">",
  "            <div className=\"min-w-0\">",
  "              <div className=\"flex flex-wrap items-center gap-2\">",
  "                <p className=\"text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-200/75\">",
  "                  My kit",
  "                </p>",
  "                <span",
  "                  className={[",
  "                    \"rounded-full border px-2.5 py-1 text-[11px] font-semibold\",",
  "                    !kitAssignment",
  "                      ? \"border-white/10 bg-white/[0.04] text-white/50\"",
  "                      : kitAssignment.status === \"COMPLETED\"",
  "                        ? \"border-emerald-400/25 bg-emerald-500/10 text-emerald-100\"",
  "                        : kitAssignment.status === \"OPENED\"",
  "                          ? \"border-sky-400/25 bg-sky-500/10 text-sky-100\"",
  "                          : \"border-amber-400/25 bg-amber-500/10 text-amber-100\",",
  "                  ].join(\" \")}",
  "                >",
  "                  {!kitAssignment",
  "                    ? \"Not assigned\"",
  "                    : kitAssignment.status === \"COMPLETED\"",
  "                      ? kitOrderLocked",
  "                        ? \"Completed and locked\"",
  "                        : \"Completed\"",
  "                      : kitAssignment.status === \"OPENED\"",
  "                        ? \"Started\"",
  "                        : \"Waiting for you\"}",
  "                </span>",
  "              </div>",
  "",
  "              <h2 className=\"mt-3 text-2xl font-semibold text-white\">",
  "                {!kitAssignment",
  "                  ? \"No kit has been assigned to you yet\"",
  "                  : kitAssignment.status === \"COMPLETED\"",
  "                    ? \"Your kit details are complete\"",
  "                    : kitAssignment.status === \"OPENED\"",
  "                      ? \"Finish your kit details\"",
  "                      : \"Complete your kit details\"}",
  "              </h2>",
  "",
  "              <p className=\"mt-2 max-w-3xl text-sm leading-6 text-white/60\">",
  "                {!kitAssignment",
  "                  ? \"Your captain has not assigned you a team kit yet. There is nothing you need to do until a kit appears here.\"",
  "                  : kitAssignment.status === \"COMPLETED\"",
  "                    ? kitOrderLocked",
  "                      ? \"Your name, shirt number and size are saved in the submitted team order. Ask your captain to contact SIXFL if anything must change.\"",
  "                      : \"Your details are saved. You can review or correct them here until your captain submits the team order.\"",
  "                    : \"Choose your kit size, shirt number and the name you want printed on the back. The same secure form is available from the email sent to you.\"}",
  "              </p>",
  "",
  "              {kitAssignment ? (",
  "                <div className=\"mt-4 flex flex-wrap gap-2 text-xs\">",
  "                  <span className=\"rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-white/65\">",
  "                    Kit {kitAssignment.position}",
  "                  </span>",
  "                  {kitAssignment.shirtNumber ? (",
  "                    <span className=\"rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-white/65\">",
  "                      Shirt {kitAssignment.shirtNumber}",
  "                    </span>",
  "                  ) : null}",
  "                  {kitAssignment.kitSize ? (",
  "                    <span className=\"rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-white/65\">",
  "                      {getTeamKitSizeLabel(kitAssignment.kitSize)}",
  "                    </span>",
  "                  ) : null}",
  "                  {kitAssignment.backName ? (",
  "                    <span className=\"rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-white/65\">",
  "                      Back: {kitAssignment.backName}",
  "                    </span>",
  "                  ) : null}",
  "                  {kitAssignment.completedAt ? (",
  "                    <span className=\"rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-emerald-100/80\">",
  "                      Completed {formatPaymentDate(kitAssignment.completedAt)}",
  "                    </span>",
  "                  ) : null}",
  "                </div>",
  "              ) : null}",
  "            </div>",
  "",
  "            {kitAssignment ? (",
  "              <Link",
  "                href={`/kit-details/${kitAssignment.token}`}",
  "                className={[",
  "                  \"inline-flex min-h-12 shrink-0 items-center justify-center rounded-2xl px-5 text-sm font-black transition\",",
  "                  kitAssignment.status === \"COMPLETED\"",
  "                    ? \"border border-emerald-400/25 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15\"",
  "                    : \"bg-emerald-400 text-black hover:bg-emerald-300\",",
  "                ].join(\" \")}",
  "              >",
  "                {kitAssignment.status === \"COMPLETED\"",
  "                  ? kitOrderLocked",
  "                    ? \"View kit details\"",
  "                    : \"Review or change details\"",
  "                  : \"Complete my kit details\"}",
  "              </Link>",
  "            ) : null}",
  "          </div>",
  "        </section>",
  "",
].join("\n");

if (!source.includes("No kit has been assigned to you yet")) {
  replaceRequired(
    '        <section className="rounded-3xl border border-amber-400/20 bg-amber-500/[0.06] p-6">',
    card +
      '        <section className="rounded-3xl border border-amber-400/20 bg-amber-500/[0.06] p-6">',
    "My kit dashboard card",
  );
}

fs.writeFileSync(pagePath, source, "utf8");

if (
  !source.includes("const kitAssignmentRows = membership") ||
  !source.includes("No kit has been assigned to you yet") ||
  !source.includes("/kit-details/${kitAssignment.token}")
) {
  throw new Error("Player dashboard My kit card was not applied correctly.");
}

console.log(
  "Player dashboards now have a permanent My kit card linked to the secure kit form.",
);
