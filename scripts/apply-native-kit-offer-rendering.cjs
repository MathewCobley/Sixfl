const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, source) {
  fs.writeFileSync(path.join(root, relativePath), source, "utf8");
}

function removeSectionContaining(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return source;

  const start = source.lastIndexOf("<section", markerIndex);
  const end = source.indexOf("</section>", markerIndex);
  if (start < 0 || end < 0) {
    throw new Error(`Could not find the section containing ${marker}.`);
  }

  return source.slice(0, start) + source.slice(end + "</section>".length);
}

const layoutPath = "src/app/captain/team/[teamid]/layout.tsx";
let layout = read(layoutPath);
layout = layout
  .replaceAll(
    'import LegacyFreeKitOfferCopyBridge from "@/components/captain/LegacyFreeKitOfferCopyBridge";\n',
    "",
  )
  .replaceAll(
    'import StandardTeamKitCopyBridge from "@/components/captain/StandardTeamKitCopyBridge";\n',
    "",
  )
  .replaceAll("          <LegacyFreeKitOfferCopyBridge />\n", "")
  .replaceAll("          <StandardTeamKitCopyBridge />\n", "")
  .replaceAll("      <LegacyFreeKitOfferCopyBridge />\n", "")
  .replaceAll("      <StandardTeamKitCopyBridge />\n", "");
write(layoutPath, layout);

const pagePath = "src/app/captain/team/[teamid]/kit/page.tsx";
let page = read(pagePath);

const orderFormImport =
  'import TeamKitOrderForm from "@/components/captain/TeamKitOrderForm";';
const nativeImports = [
  'import IncludedKitPaymentPanel from "@/components/captain/IncludedKitPaymentPanel";',
  'import StandardKitPaymentPanel from "@/components/captain/StandardKitPaymentPanel";',
  orderFormImport,
].join("\n");
if (!page.includes("IncludedKitPaymentPanel")) {
  if (!page.includes(orderFormImport)) {
    throw new Error("The captain kit page form import was not found.");
  }
  page = page.replace(orderFormImport, nativeImports);
}

page = page
  .replaceAll(
    '              £70 Founding Team Kit Package',
    '              {purchaseOnly ? "Team kit order" : "Free team kit offer"}',
  )
  .replaceAll(
    '              £90 Founding Team Kit Package',
    '              {purchaseOnly ? "Team kit order" : "Free team kit offer"}',
  )
  .replaceAll(
    "Your team receives {includedKitQuantity} included kits",
    "Your team receives {includedKitQuantity} complete kits free of charge",
  )
  .replaceAll(
    " The £70 contribution must be paid before the supplier order is placed.",
    "",
  )
  .replaceAll(
    " The £90 contribution must be paid before the supplier order is placed.",
    "",
  )
  .replaceAll(
    "while SIXFL checks the order and arranges the £70 payment",
    "while SIXFL checks and places the order",
  )
  .replaceAll(
    "while SIXFL checks the order and arranges the £90 payment",
    "while SIXFL checks and places the order",
  );

const contributionCopyMarkers = [
  "The compulsory team contribution is £70 in total",
  "The compulsory team contribution is £90 in total",
];
for (const marker of contributionCopyMarkers) {
  const markerIndex = page.indexOf(marker);
  if (markerIndex < 0) continue;

  const paragraphStart = page.lastIndexOf("<p", markerIndex);
  const paragraphEnd = page.indexOf("</p>", markerIndex);
  if (paragraphStart < 0 || paragraphEnd < 0) {
    throw new Error("The captain kit contribution paragraph could not be removed.");
  }

  let removeEnd = paragraphEnd + "</p>".length;
  const linkStart = page.indexOf("<Link", removeEnd);
  const savedNotice = page.indexOf('{sp.saved === "1"', removeEnd);
  if (
    linkStart >= 0 &&
    (savedNotice < 0 || linkStart < savedNotice) &&
    page.slice(linkStart, linkStart + 300).includes("founding-team-kit-terms")
  ) {
    const linkEnd = page.indexOf("</Link>", linkStart);
    if (linkEnd >= 0) removeEnd = linkEnd + "</Link>".length;
  }

  page = page.slice(0, paragraphStart) + page.slice(removeEnd);
}

const panelMarker = '      {sp.saved === "1" ? (';
if (!page.includes("<IncludedKitPaymentPanel")) {
  if (!page.includes(panelMarker)) {
    throw new Error("The captain kit page native panel position was not found.");
  }

  const nativePanels = [
    "      {purchaseOnly ? (",
    "        <StandardKitPaymentPanel teamId={team.id} />",
    "      ) : (",
    "        <IncludedKitPaymentPanel",
    "          teamId={team.id}",
    "          includedKitQuantity={includedKitQuantity}",
    "        />",
    "      )}",
    "",
  ].join("\n");

  page = page.replace(panelMarker, nativePanels + panelMarker);
}
write(pagePath, page);

const formPath = "src/components/captain/TeamKitOrderForm.tsx";
let form = read(formPath);
form = removeSectionContaining(form, "Compulsory printing contribution");

const formActionsMarker = "      {!locked ? (";
if (!form.includes("There is no printing charge")) {
  const actionIndex = form.lastIndexOf(formActionsMarker);
  if (actionIndex < 0) {
    throw new Error("The team kit form action position was not found.");
  }

  const offerSummary = [
    "      {includedKitQuantity > 0 ? (",
    '        <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.07] p-5 sm:p-6">',
    '          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-100/60">',
    "            Free kit allocation",
    "          </div>",
    '          <div className="mt-2 text-2xl font-semibold text-white">',
    "            {includedKitQuantity} complete kits included",
    "          </div>",
    '          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">',
    "            The included shirts, shorts, socks and personalisation are free of charge. There is no printing charge. Additional complete kits cost £20 each.",
    "          </p>",
    "        </section>",
    "      ) : (",
    '        <section className="rounded-3xl border border-sky-400/20 bg-sky-500/[0.07] p-5 sm:p-6">',
    '          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-100/60">',
    "            Paid kit order",
    "          </div>",
    '          <div className="mt-2 text-2xl font-semibold text-white">',
    "            £20 per complete kit",
    "          </div>",
    '          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">',
    "            Only kits with a completed player payment are included below. Please check every design, size, name and shirt number before submitting.",
    "          </p>",
    "        </section>",
    "      )}",
    "",
  ].join("\n");

  form = form.slice(0, actionIndex) + offerSummary + form.slice(actionIndex);
}

form = form
  .replaceAll(
    "              {includedKitQuantity} included + {kitQuantity - includedKitQuantity} paid additional",
    "              {includedKitQuantity} free + {kitQuantity - includedKitQuantity} paid additional",
  )
  .replaceAll(
    "One design will be used for all seven kits.",
    "One design will be used for all {kitQuantity} kits.",
  )
  .replaceAll(
    "One design will be used for all nine kits.",
    "One design will be used for all {kitQuantity} kits.",
  )
  .replaceAll(
    "            Submit £70 kit package",
    '            {includedKitQuantity > 0 ? "Submit free kit order" : "Submit paid kit order"}',
  )
  .replaceAll(
    "            Submit £90 kit package",
    '            {includedKitQuantity > 0 ? "Submit free kit order" : "Submit paid kit order"}',
  )
  .replaceAll(
    "            Submit all seven kits",
    '            {includedKitQuantity > 0 ? "Submit free kit order" : "Submit paid kit order"}',
  )
  .replaceAll(
    "            Submit all nine kits",
    '            {includedKitQuantity > 0 ? "Submit free kit order" : "Submit paid kit order"}',
  );
write(formPath, form);

const standardPanelPath =
  "src/components/captain/StandardKitPaymentPanel.tsx";
let standardPanel = read(standardPanelPath);
standardPanel = standardPanel.replace(
  '    <section className="mx-auto mb-2 mt-4 w-[calc(100%-1.5rem)] max-w-[1400px] rounded-3xl border border-sky-400/25 bg-sky-500/[0.08] p-5 sm:w-[calc(100%-5rem)] sm:p-6">',
  '    <section className="w-full rounded-3xl border border-sky-400/25 bg-sky-500/[0.08] p-5 sm:p-6">',
);
write(standardPanelPath, standardPanel);

const checks = [
  !layout.includes("LegacyFreeKitOfferCopyBridge"),
  !layout.includes("StandardTeamKitCopyBridge"),
  page.includes("<IncludedKitPaymentPanel"),
  page.includes("<StandardKitPaymentPanel"),
  page.includes("complete kits free of charge"),
  form.includes("There is no printing charge"),
  !form.includes("Compulsory printing contribution"),
  !form.includes("£70 per team"),
  !form.includes("£90 per team"),
  standardPanel.includes('className="w-full rounded-3xl'),
];

if (checks.some((check) => !check)) {
  throw new Error("Native team-kit offer rendering was not applied correctly.");
}

console.log(
  "Team kit offers and payment panels now render natively in the kit page; the copy bridges are no longer mounted.",
);
