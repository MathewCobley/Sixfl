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

function replaceAllText(filePath, replacements) {
  let source = read(filePath);
  let changed = false;

  for (const [before, after] of replacements) {
    if (source.includes(before)) {
      source = source.split(before).join(after);
      changed = true;
    }
  }

  if (changed) write(filePath, source);
}

const registerPage = "src/app/(public)/register-interest/page.tsx";
const registerActions = "src/app/(public)/register-interest/actions.ts";
const registerTeamActions = "src/app/(public)/register-team/actions.ts";
const leadDetail = "src/app/(admin)/admin/leads/[id]/page.tsx";
const leadList = "src/app/(admin)/admin/leads/page.tsx";
const leadActions = "src/app/(admin)/admin/leads/actions.ts";
const adminPackagePage = "src/app/(admin)/admin/teams/free-kit/page.tsx";
const manualLeadForm = "src/components/admin/leads/ManualLeadForm.tsx";
const teamBadge = "src/components/admin/teams/FreeKitTeamBadgesBridge.tsx";
const captainPage = "src/app/captain/team/[teamid]/kit/page.tsx";
const captainForm = "src/components/captain/TeamKitOrderForm.tsx";
const adminKitsPage = "src/app/(admin)/admin/kits/page.tsx";

replaceOnce(
  registerPage,
  [
    "              {config.showFreeKit ? (",
    "                <CheckboxField",
    '                  name="wantsFreeKit"',
    '                  label="I’d like to be considered for the founding teams free kit offer"',
    "                />",
    "              ) : null}",
  ].join("\n"),
  [
    "              {config.showFreeKit ? (",
    '                <div className="space-y-2">',
    "                  <CheckboxField",
    '                    name="wantsFreeKit"',
    '                    label="I’d like to be considered for the £90 Founding Team Kit Package (nine complete kits at £10 per shirt)"',
    "                  />",
    '                  <p className="px-1 text-xs leading-5 text-white/50">',
    "                    The £90 contribution is compulsory if a package is allocated and must be paid before the personalised order is placed.{' '}",
    '                    <Link href="/founding-team-kit-terms" className="font-semibold text-emerald-300 hover:text-emerald-200">',
    "                      Read the package terms",
    "                    </Link>",
    "                  </p>",
    "                </div>",
    "              ) : null}",
  ].join("\n"),
  "register-interest kit package choice",
);

replaceAllText(registerActions, [
  ["Free kit interest:", "£90 kit package interest:"],
  ["<strong>Free kit interest:</strong>", "<strong>£90 kit package interest:</strong>"],
]);

replaceAllText(registerTeamActions, [
  ["Free kit", "£90 kit package"],
  ["free kit", "£90 kit package"],
]);

replaceAllText(leadDetail, [["label=\"Free kit\"", "label=\"£90 kit package\""]]);
replaceAllText(leadList, [
  ["Free kit", "£90 kit package"],
  ["free kit", "£90 kit package"],
]);
replaceAllText(leadActions, [
  ["Free kit", "£90 kit package"],
  ["free kit", "£90 kit package"],
]);

replaceAllText(adminPackagePage, [
  ["Kit offer", "Founding kit package"],
  ["Free-kit teams", "£90 kit-package teams"],
  [
    "Teams whose original registration included the free-kit offer. Converted leads are\n            linked using their exact team id rather than a name or email match.",
    "Teams whose registration included interest in the nine-kit package. The compulsory\n            contribution is £90 per team — £10 per personalised shirt.",
  ],
  ["Opted in", "Interested teams"],
  ["No converted teams have opted in.", "No converted teams have requested the package."],
  ["Free kit requested", "£90 kit package requested"],
]);

replaceAllText(manualLeadForm, [
  ["Interested in free kit offer", "Interested in £90 Founding Team Kit Package"],
]);
replaceAllText(teamBadge, [["Free kit", "£90 kit package"]]);

replaceAllText(captainPage, [["Team kit order", "£90 Founding Team Kit Package"]]);

replaceOnce(
  captainPage,
  [
    "            <p className=\"mt-3 max-w-3xl text-sm leading-6 text-white/60 sm:text-base\">",
    "              Your team receives {TEAM_KIT_QUANTITY} complete kits. Choose one design,",
    "              then enter the kit size, back name and shirt number for each player.",
    "            </p>",
  ].join("\n"),
  [
    "            <p className=\"mt-3 max-w-3xl text-sm leading-6 text-white/60 sm:text-base\">",
    "              Your team receives {TEAM_KIT_QUANTITY} complete kits. Choose one design,",
    "              then enter the kit size, back name and shirt number for each player.",
    "            </p>",
    "            <p className=\"mt-3 max-w-3xl text-sm leading-6 text-amber-100/80\">",
    "              The compulsory team contribution is £90 in total — £10 for each of the nine personalised shirts. Payment is required before SIXFL places the supplier order.",
    "            </p>",
    "            <Link href=\"/founding-team-kit-terms\" className=\"mt-3 inline-flex text-sm font-semibold text-emerald-200 underline decoration-emerald-400/40 underline-offset-4 hover:text-emerald-100\">",
    "              Read the Kit Package Terms",
    "            </Link>",
  ].join("\n"),
  "captain kit package price introduction",
);

replaceAllText(captainPage, [
  [
    "Your nine-kit order has been submitted to SIXFL. It is now locked while we review it.",
    "Your nine-kit order has been submitted to SIXFL. It is now locked while we review it. The £90 contribution must be paid before the supplier order is placed.",
  ],
  [
    "The details below are read-only while SIXFL checks and places the order.\n            Contact us if anything needs changing.",
    "The details below are read-only while SIXFL checks the order and arranges the £90 payment. Contact us if anything needs changing before production begins.",
  ],
]);

replaceOnce(
  captainForm,
  [
    "      {!locked ? (",
    '        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">',
  ].join("\n"),
  [
    '      <section className="rounded-3xl border border-amber-400/20 bg-amber-500/[0.07] p-5 sm:p-6">',
    '        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">',
    "          <div>",
    '            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-100/55">',
    "              Compulsory printing contribution",
    "            </div>",
    '            <div className="mt-2 text-2xl font-semibold text-white">£90 per team</div>',
    '            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">',
    "              This is £10 for each of the nine personalised shirts. Submitting confirms that the captain has checked the design, sizes, names and numbers. Payment is required before SIXFL places the supplier order.",
    "            </p>",
    "          </div>",
    '          <a href="/founding-team-kit-terms" className="text-sm font-semibold text-emerald-200 underline decoration-emerald-400/40 underline-offset-4 hover:text-emerald-100">',
    "            Read package terms",
    "          </a>",
    "        </div>",
    "      </section>",
    "",
    "      {!locked ? (",
    '        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">',
  ].join("\n"),
  "captain package price acknowledgement",
);
replaceAllText(captainForm, [["Submit all nine kits", "Submit £90 kit package"]]);

replaceOnce(
  adminKitsPage,
  "              Upload the supplier designs, manage which kits captains can choose and process each team&apos;s personalised order of {TEAM_KIT_QUANTITY} kits.",
  "              Upload the supplier designs, manage which kits captains can choose and process each team&apos;s personalised order of {TEAM_KIT_QUANTITY} kits. Each package carries a compulsory £90 team contribution before the supplier order is placed.",
  "admin kit package price copy",
);

const auditedFiles = [
  registerPage,
  registerActions,
  adminPackagePage,
  manualLeadForm,
  teamBadge,
  captainPage,
  captainForm,
  adminKitsPage,
];
const remainingOldCopy = auditedFiles
  .map((filePath) => `${filePath}\n${read(filePath)}`)
  .filter((source) => /founding teams free kit offer|Free kit interest:|Free-kit teams|Free kit requested|Interested in free kit offer|>Free kit</i.test(source));

if (remainingOldCopy.length) {
  throw new Error("Old customer-facing free-kit wording remains after the pricing copy update.");
}

console.log("Applied £90 Founding Team Kit Package wording across registration, captain and admin screens.");
