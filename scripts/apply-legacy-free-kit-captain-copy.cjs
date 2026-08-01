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

const captainPage = "src/app/captain/team/[teamid]/kit/page.tsx";
const captainForm = "src/components/captain/TeamKitOrderForm.tsx";

replaceOnce(
  captainPage,
  "  const [allDesigns, order] = await Promise.all([",
  [
    "  const legacyOfferRows = await prisma.$queryRaw<Array<{ isLegacyOffer: boolean }>>`",
    "    SELECT (",
    "      EXISTS (",
    '        SELECT 1',
    '        FROM "InterestLead" lead',
    '        WHERE lead."convertedTeamId" = ${teamid}',
    '          AND lead."wantsFreeKit" = TRUE',
    "          AND lead.\"createdAt\" < TIMESTAMPTZ '2026-08-01 10:33:15+00'",
    "      )",
    "      OR (",
    "        EXISTS (",
    '          SELECT 1',
    '          FROM "Team" legacy_team',
    '          WHERE legacy_team."id" = ${teamid}',
    '            AND legacy_team."wantsFreeKit" = TRUE',
    "            AND legacy_team.\"createdAt\" < TIMESTAMPTZ '2026-08-01 10:33:15+00'",
    "        )",
    "        AND NOT EXISTS (",
    '          SELECT 1',
    '          FROM "InterestLead" linked_lead',
    '          WHERE linked_lead."convertedTeamId" = ${teamid}',
    '            AND linked_lead."wantsFreeKit" = TRUE',
    "        )",
    "      )",
    '    ) AS "isLegacyOffer"',
    "  `;",
    "  const isLegacyFreeKitOffer = Boolean(legacyOfferRows[0]?.isLegacyOffer);",
    "",
    "  const [allDesigns, order] = await Promise.all([",
  ].join("\n"),
  "legacy kit-offer lookup",
);

replaceOnce(
  captainPage,
  "              £90 Founding Team Kit Package",
  '              {isLegacyFreeKitOffer ? "Original free kit offer" : "£90 Founding Team Kit Package"}',
  "legacy-aware kit page badge",
);

replaceOnce(
  captainPage,
  [
    '            <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-100/80">',
    "              The compulsory team contribution is £90 in total — £10 for each of the nine personalised shirts. Payment is required before SIXFL places the supplier order.",
    "            </p>",
    '            <Link href="/founding-team-kit-terms" className="mt-3 inline-flex text-sm font-semibold text-emerald-200 underline decoration-emerald-400/40 underline-offset-4 hover:text-emerald-100">',
    "              Read the Kit Package Terms",
    "            </Link>",
  ].join("\n"),
  [
    "            {isLegacyFreeKitOffer ? (",
    '              <p className="mt-3 max-w-3xl text-sm leading-6 text-emerald-100/80">',
    "                Your team selected the original founding-team free kit offer before it changed. SIXFL will honour that offer for this nine-kit order, so the new £90 contribution does not apply.",
    "              </p>",
    "            ) : (",
    "              <>",
    '                <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-100/80">',
    "                  The compulsory team contribution is £90 in total — £10 for each of the nine personalised shirts. Payment is required before SIXFL places the supplier order.",
    "                </p>",
    '                <Link href="/founding-team-kit-terms" className="mt-3 inline-flex text-sm font-semibold text-emerald-200 underline decoration-emerald-400/40 underline-offset-4 hover:text-emerald-100">',
    "                  Read the Kit Package Terms",
    "                </Link>",
    "              </>",
    "            )}",
  ].join("\n"),
  "legacy-aware kit page price explanation",
);

replaceOnce(
  captainPage,
  "          Your nine-kit order has been submitted to SIXFL. It is now locked while we review it. The £90 contribution must be paid before the supplier order is placed.",
  '          {isLegacyFreeKitOffer\n            ? "Your original free-kit order has been submitted to SIXFL. It is now locked while we review it. No £90 contribution applies to this order."\n            : "Your nine-kit order has been submitted to SIXFL. It is now locked while we review it. The £90 contribution must be paid before the supplier order is placed."}',
  "legacy-aware submitted message",
);

replaceOnce(
  captainPage,
  "            The details below are read-only while SIXFL checks the order and arranges the £90 payment. Contact us if anything needs changing before production begins.",
  '            {isLegacyFreeKitOffer\n              ? "The details below are read-only while SIXFL checks and places your original free-kit order. Contact us if anything needs changing before production begins."\n              : "The details below are read-only while SIXFL checks the order and arranges the £90 payment. Contact us if anything needs changing before production begins."}',
  "legacy-aware locked-order message",
);

replaceOnce(
  captainPage,
  [
    "          initialCaptainNotes={order?.captainNotes ?? null}",
    "          locked={locked}",
  ].join("\n"),
  [
    "          initialCaptainNotes={order?.captainNotes ?? null}",
    "          legacyFreeKitOffer={isLegacyFreeKitOffer}",
    "          locked={locked}",
  ].join("\n"),
  "legacy kit-offer form prop",
);

replaceOnce(
  captainForm,
  [
    "  initialCaptainNotes: string | null;",
    "  locked: boolean;",
  ].join("\n"),
  [
    "  initialCaptainNotes: string | null;",
    "  legacyFreeKitOffer: boolean;",
    "  locked: boolean;",
  ].join("\n"),
  "legacy kit-offer prop type",
);

replaceOnce(
  captainForm,
  [
    "  initialCaptainNotes,",
    "  locked,",
  ].join("\n"),
  [
    "  initialCaptainNotes,",
    "  legacyFreeKitOffer,",
    "  locked,",
  ].join("\n"),
  "legacy kit-offer prop destructuring",
);

replaceOnce(
  captainForm,
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
  ].join("\n"),
  [
    "      {legacyFreeKitOffer ? (",
    '        <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.07] p-5 sm:p-6">',
    '          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-100/60">',
    "            Original free kit offer honoured",
    "          </div>",
    '          <div className="mt-2 text-2xl font-semibold text-white">No £90 contribution</div>',
    '          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">',
    "            Your team selected the free kit offer before it changed. The new compulsory printing contribution does not apply to this original nine-kit order. Please still check every size, name and shirt number carefully before submitting.",
    "          </p>",
    "        </section>",
    "      ) : (",
    '        <section className="rounded-3xl border border-amber-400/20 bg-amber-500/[0.07] p-5 sm:p-6">',
    '          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">',
    "            <div>",
    '              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-100/55">',
    "                Compulsory printing contribution",
    "              </div>",
    '              <div className="mt-2 text-2xl font-semibold text-white">£90 per team</div>',
    '              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">',
    "                This is £10 for each of the nine personalised shirts. Submitting confirms that the captain has checked the design, sizes, names and numbers. Payment is required before SIXFL places the supplier order.",
    "              </p>",
    "            </div>",
    '            <a href="/founding-team-kit-terms" className="text-sm font-semibold text-emerald-200 underline decoration-emerald-400/40 underline-offset-4 hover:text-emerald-100">',
    "              Read package terms",
    "            </a>",
    "          </div>",
    "        </section>",
    "      )}",
  ].join("\n"),
  "legacy-aware form contribution panel",
);

replaceOnce(
  captainForm,
  "            Submit £90 kit package",
  '            {legacyFreeKitOffer ? "Submit free kit order" : "Submit £90 kit package"}',
  "legacy-aware submit button",
);

console.log(
  "Applied legacy free-kit wording for teams whose interest was recorded before the £90 package went live.",
);
