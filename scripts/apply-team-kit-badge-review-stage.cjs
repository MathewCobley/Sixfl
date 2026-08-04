const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const schemaPath = path.join(root, "prisma", "schema.prisma");
const formPath = path.join(
  root,
  "src",
  "components",
  "captain",
  "TeamKitOrderForm.tsx",
);
const captainPagePath = path.join(
  root,
  "src",
  "app",
  "captain",
  "team",
  "[teamid]",
  "kit",
  "page.tsx",
);
const adminPagePath = path.join(
  root,
  "src",
  "app",
  "(admin)",
  "admin",
  "kits",
  "page.tsx",
);

for (const filePath of [schemaPath, formPath, captainPagePath, adminPagePath]) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required badge-review file is missing: ${path.relative(root, filePath)}`);
  }
}

// Prisma schema: store the captain's badge decision on the Team record.
let schema = fs.readFileSync(schemaPath, "utf8");
const teamModelStart = schema.indexOf("model Team {");
const nextModelStart = schema.indexOf("\nmodel ", teamModelStart + 1);
if (teamModelStart < 0 || nextModelStart < 0) {
  throw new Error("Team model could not be located in Prisma schema.");
}
let teamModel = schema.slice(teamModelStart, nextModelStart);

if (!teamModel.includes("kitBadgeConfirmedAt")) {
  const logoLine = "  logoUrl   String?";
  if (!teamModel.includes(logoLine)) {
    throw new Error("Team logoUrl field could not be located.");
  }
  teamModel = teamModel.replace(
    logoLine,
    [
      logoLine,
      "",
      "  kitBadgeConfirmedAt       DateTime?",
      "  kitBadgeChangeRequestedAt DateTime?",
      "  kitBadgeChangeRequestNote String?",
    ].join("\n"),
  );
}

if (!teamModel.includes("@@index([kitBadgeChangeRequestedAt])")) {
  const closingBrace = teamModel.lastIndexOf("}");
  if (closingBrace < 0) throw new Error("Team model closing brace was not found.");
  teamModel =
    teamModel.slice(0, closingBrace) +
    "  @@index([kitBadgeChangeRequestedAt])\n" +
    teamModel.slice(closingBrace);
}

schema = schema.slice(0, teamModelStart) + teamModel + schema.slice(nextModelStart);
fs.writeFileSync(schemaPath, schema, "utf8");

// Captain order page: load the badge and its recorded review state, then pass it
// into the order form so the third stage appears in the correct sequence.
let page = fs.readFileSync(captainPagePath, "utf8");
const teamSelectStart = page.indexOf("  const team = await prisma.team.findUnique({");
const teamSelectEnd = page.indexOf("  });", teamSelectStart);
if (teamSelectStart < 0 || teamSelectEnd < 0) {
  throw new Error("Captain kit team query could not be located.");
}
let teamQuery = page.slice(teamSelectStart, teamSelectEnd + 5);
if (!teamQuery.includes("kitBadgeConfirmedAt: true")) {
  const selectMarker = "      id: true,\n      name: true,";
  if (!teamQuery.includes(selectMarker)) {
    throw new Error("Captain kit team select marker was not found.");
  }
  teamQuery = teamQuery.replace(
    selectMarker,
    [
      "      id: true,",
      "      name: true,",
      "      logoUrl: true,",
      "      kitBadgeConfirmedAt: true,",
      "      kitBadgeChangeRequestedAt: true,",
      "      kitBadgeChangeRequestNote: true,",
    ].join("\n"),
  );
  page = page.slice(0, teamSelectStart) + teamQuery + page.slice(teamSelectEnd + 5);
}

const orderFormStart = page.indexOf("        <TeamKitOrderForm");
const orderFormEnd = page.indexOf("        />", orderFormStart);
if (orderFormStart < 0 || orderFormEnd < 0) {
  throw new Error("TeamKitOrderForm usage could not be located.");
}
let orderFormBlock = page.slice(orderFormStart, orderFormEnd);
if (!orderFormBlock.includes("teamLogoUrl={team.logoUrl}")) {
  const propMarker = "          includedKitQuantity={TEAM_KIT_QUANTITY}";
  if (!orderFormBlock.includes(propMarker)) {
    throw new Error("Dynamic included-kit form prop was not found.");
  }
  orderFormBlock = orderFormBlock.replace(
    propMarker,
    [
      propMarker,
      "          teamId={team.id}",
      "          teamName={team.name}",
      "          teamLogoUrl={team.logoUrl}",
      "          initialBadgeStatus={",
      "            team.kitBadgeChangeRequestedAt",
      '              ? "CHANGE_REQUESTED"',
      "              : team.kitBadgeConfirmedAt",
      '                ? "CONFIRMED"',
      '                : "PENDING"',
      "          }",
      "          initialBadgeConfirmedAt={",
      "            team.kitBadgeConfirmedAt?.toISOString() ?? null",
      "          }",
      "          initialBadgeChangeRequestedAt={",
      "            team.kitBadgeChangeRequestedAt?.toISOString() ?? null",
      "          }",
      "          initialBadgeChangeRequestNote={team.kitBadgeChangeRequestNote}",
    ].join("\n"),
  );
  page = page.slice(0, orderFormStart) + orderFormBlock + page.slice(orderFormEnd);
}
fs.writeFileSync(captainPagePath, page, "utf8");

// Team order form: mount the badge review after personalisation and before the
// final notes/submit area, making it an explicit Step 3.
let form = fs.readFileSync(formPath, "utf8");
const badgeImport =
  'import TeamBadgeReviewPanel from "@/components/captain/TeamBadgeReviewPanel";';
if (!form.includes(badgeImport)) {
  const importAnchor = 'import FormListboxField from "@/components/ui/FormListboxField";';
  if (!form.includes(importAnchor)) {
    throw new Error("Team kit form UI import anchor was not found.");
  }
  form = form.replace(importAnchor, `${importAnchor}\n${badgeImport}`);
}

if (!form.includes("  teamLogoUrl: string | null;")) {
  const propsMarker = "  includedKitQuantity: number;";
  if (!form.includes(propsMarker)) {
    throw new Error("Dynamic TeamKitOrderForm props were not found.");
  }
  form = form.replace(
    propsMarker,
    [
      propsMarker,
      "  teamId: string;",
      "  teamName: string;",
      "  teamLogoUrl: string | null;",
      '  initialBadgeStatus: "PENDING" | "CONFIRMED" | "CHANGE_REQUESTED";',
      "  initialBadgeConfirmedAt: string | null;",
      "  initialBadgeChangeRequestedAt: string | null;",
      "  initialBadgeChangeRequestNote: string | null;",
    ].join("\n"),
  );
}

if (!form.includes("  teamLogoUrl,\n")) {
  const destructureMarker = "  includedKitQuantity,\n  initialDesignId,";
  if (!form.includes(destructureMarker)) {
    throw new Error("TeamKitOrderForm prop destructuring marker was not found.");
  }
  form = form.replace(
    destructureMarker,
    [
      "  includedKitQuantity,",
      "  teamId,",
      "  teamName,",
      "  teamLogoUrl,",
      "  initialBadgeStatus,",
      "  initialBadgeConfirmedAt,",
      "  initialBadgeChangeRequestedAt,",
      "  initialBadgeChangeRequestNote,",
      "  initialDesignId,",
    ].join("\n"),
  );
}

if (!form.includes("<TeamBadgeReviewPanel")) {
  const stepTwoMarker = "Personalise all {kitQuantity} kits";
  const stepTwoIndex = form.indexOf(stepTwoMarker);
  if (stepTwoIndex < 0) {
    throw new Error("Team kit personalisation step could not be located.");
  }
  const stepTwoEnd = form.indexOf("</section>", stepTwoIndex);
  if (stepTwoEnd < 0) {
    throw new Error("Team kit personalisation section end could not be located.");
  }
  const insertionPoint = stepTwoEnd + "</section>".length;
  const badgePanel = `

      <TeamBadgeReviewPanel
        teamId={teamId}
        teamName={teamName}
        logoUrl={teamLogoUrl}
        initialStatus={initialBadgeStatus}
        initialConfirmedAt={initialBadgeConfirmedAt}
        initialChangeRequestedAt={initialBadgeChangeRequestedAt}
        initialChangeRequestNote={initialBadgeChangeRequestNote}
      />`;
  form = form.slice(0, insertionPoint) + badgePanel + form.slice(insertionPoint);
}
fs.writeFileSync(formPath, form, "utf8");

// Admin kits page: surface requests so clicking "I'd like it changed" creates
// an immediately visible operational task rather than a hidden database flag.
let admin = fs.readFileSync(adminPagePath, "utf8");
if (!admin.includes('import { prisma } from "@/lib/prisma";')) {
  const adminImportAnchor = 'import { requireAdmin } from "@/lib/requireAdmin";';
  if (!admin.includes(adminImportAnchor)) {
    throw new Error("Admin kits import anchor was not found.");
  }
  admin = admin.replace(
    adminImportAnchor,
    'import { prisma } from "@/lib/prisma";\n' + adminImportAnchor,
  );
}

if (!admin.includes("badgeChangeRequests] = await Promise.all")) {
  const promiseBlock = [
    "  const [allDesigns, orders] = await Promise.all([",
    "    listKitDesigns({ includeInactive: true }),",
    "    listAdminTeamKitOrders(),",
    "  ]);",
  ].join("\n");
  if (!admin.includes(promiseBlock)) {
    throw new Error("Admin kits data query block was not found.");
  }
  admin = admin.replace(
    promiseBlock,
    [
      "  const [allDesigns, orders, badgeChangeRequests] = await Promise.all([",
      "    listKitDesigns({ includeInactive: true }),",
      "    listAdminTeamKitOrders(),",
      "    prisma.team.findMany({",
      "      where: { kitBadgeChangeRequestedAt: { not: null } },",
      "      orderBy: { kitBadgeChangeRequestedAt: \"asc\" },",
      "      select: {",
      "        id: true,",
      "        name: true,",
      "        logoUrl: true,",
      "        contactName: true,",
      "        contactEmail: true,",
      "        kitBadgeChangeRequestedAt: true,",
      "        kitBadgeChangeRequestNote: true,",
      "      },",
      "    }),",
      "  ]);",
    ].join("\n"),
  );
}

if (!admin.includes("Badge change requests")) {
  const errorBlockEndMarker = "      ) : null}\n\n      <div className=\"grid gap-4 sm:grid-cols-2 xl:grid-cols-4\">";
  if (!admin.includes(errorBlockEndMarker)) {
    throw new Error("Admin kits notice area could not be located.");
  }
  const requestPanel = `      ) : null}

      {badgeChangeRequests.length > 0 ? (
        <section className="rounded-3xl border border-amber-400/25 bg-amber-500/[0.07] p-5 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-100/55">
                Badge change requests
              </div>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                {badgeChangeRequests.length} team{badgeChangeRequests.length === 1 ? "" : "s"} want a badge change
              </h2>
              <p className="mt-2 text-sm text-white/55">
                These requests came from Step 3 of the captain&apos;s kit order.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {badgeChangeRequests.map((request) => (
              <div key={request.id} className="flex gap-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-2">
                  {request.logoUrl ? (
                    <img src={request.logoUrl} alt={`${request.name} badge`} className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-2xl font-black text-white/25">
                      {request.name.split(/\\s+/).filter(Boolean).slice(0, 3).map((word) => word[0]?.toUpperCase()).join("")}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-semibold text-white">{request.name}</div>
                  <div className="mt-1 text-xs text-white/40">
                    Requested {formatDate(request.kitBadgeChangeRequestedAt)}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-amber-50/80">
                    {request.kitBadgeChangeRequestNote || "No details supplied."}
                  </p>
                  {request.contactEmail ? (
                    <a href={`mailto:${request.contactEmail}`} className="mt-3 inline-flex text-xs font-semibold text-amber-200 underline decoration-amber-400/40 underline-offset-4">
                      Email {request.contactName || request.name}
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">`;
  admin = admin.replace(errorBlockEndMarker, requestPanel);
}
fs.writeFileSync(adminPagePath, admin, "utf8");

const checks = [
  fs.readFileSync(schemaPath, "utf8").includes("kitBadgeConfirmedAt"),
  fs.readFileSync(captainPagePath, "utf8").includes("teamLogoUrl={team.logoUrl}"),
  fs.readFileSync(formPath, "utf8").includes("<TeamBadgeReviewPanel"),
  fs.readFileSync(adminPagePath, "utf8").includes("Badge change requests"),
];
if (checks.some((check) => !check)) {
  throw new Error("Team badge review stage was not applied correctly.");
}

console.log(
  "Team kit orders now include a Step 3 badge review, with confirmations saved and change requests visible to SIXFL admin.",
);
