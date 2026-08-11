const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, source) {
  fs.writeFileSync(path.join(root, relativePath), source, "utf8");
}

function replaceIfPresent(source, before, after) {
  return source.includes(before) ? source.replaceAll(before, after) : source;
}

const pagePath = "src/app/captain/team/[teamid]/kit/page.tsx";
let page = read(pagePath);

if (!page.includes('from "next/cache"')) {
  page = page.replace(
    'import Link from "next/link";',
    'import { revalidatePath } from "next/cache";\nimport Link from "next/link";',
  );
}

if (!page.includes("TeamKitDesignPreferencePicker")) {
  const marker = 'import TeamKitOrderForm from "@/components/captain/TeamKitOrderForm";';
  if (!page.includes(marker)) {
    throw new Error("Captain kit form import was not found for the design chooser.");
  }
  page = page.replace(
    marker,
    'import TeamKitDesignPreferencePicker from "@/components/captain/TeamKitDesignPreferencePicker";\n' + marker,
  );
}

if (!page.includes("preferredKitDesignId")) {
  const marker = "  const selectedDesignId = order?.kitDesignId ?? null;";
  if (!page.includes(marker)) {
    throw new Error("Captain kit selected-design marker was not found.");
  }
  page = page.replace(
    marker,
    [
      '  const preferenceRows = await prisma.$queryRaw<Array<{ kitDesignPreferenceId: string | null }>>`',
      '    SELECT "kitDesignPreferenceId"',
      '    FROM "Team"',
      '    WHERE "id" = ${teamid}',
      '    LIMIT 1',
      '  `;',
      '  const preferredKitDesignId = preferenceRows[0]?.kitDesignPreferenceId ?? null;',
      '  const selectedDesignId = order?.kitDesignId ?? preferredKitDesignId;',
    ].join("\n"),
  );
}

if (!page.includes("saveKitDesignPreferenceAction")) {
  const returnIndex = page.indexOf("\n\n  return (");
  if (returnIndex < 0) {
    throw new Error("Captain kit page return marker was not found.");
  }

  const action = `

  async function saveKitDesignPreferenceAction(formData: FormData) {
    "use server";

    await requireCaptain(teamid);
    const kitDesignId = String(formData.get("kitDesignId") ?? "").trim();
    if (!kitDesignId) return;

    const design = await prisma.kitDesign.findFirst({
      where: { id: kitDesignId, isActive: true },
      select: { id: true },
    });
    if (!design) return;

    await prisma.$executeRaw\`
      UPDATE "Team"
      SET "kitDesignPreferenceId" = \${design.id}, "updatedAt" = NOW()
      WHERE "id" = \${teamid}
    \`;
    revalidatePath(\`/captain/team/\${teamid}/kit\`);
  }`;

  page = page.slice(0, returnIndex) + action + page.slice(returnIndex);
}

const hiddenFormMarker = "      {kitQuantity <= 0 ? null : designs.length === 0 ? (";
if (page.includes(hiddenFormMarker)) {
  page = page.replace(
    hiddenFormMarker,
    [
      "      {kitQuantity <= 0 && designs.length > 0 ? (",
      "        <TeamKitDesignPreferencePicker",
      "          teamName={team.name}",
      "          designs={designs.map((design) => ({",
      "            id: design.id,",
      "            code: design.code,",
      "            name: design.name,",
      "            primaryColour: design.primaryColour,",
      "            secondaryColour: design.secondaryColour,",
      "            style: design.style,",
      "            updatedAtIso: design.updatedAt.toISOString(),",
      "          }))}",
      "          selectedDesignId={selectedDesignId}",
      "          action={saveKitDesignPreferenceAction}",
      "        />",
      "      ) : designs.length === 0 ? (",
    ].join("\n"),
  );
}

page = replaceIfPresent(
  page,
  '{purchaseOnly ? "Team kit order" : "Free team kit offer"}',
  'Team kit order',
);
page = replaceIfPresent(page, "complete kits free of charge", "complete kits included");
page = replaceIfPresent(page, "Free team kit offer", "Team kit order");

write(pagePath, page);

const formPath = "src/components/captain/TeamKitOrderForm.tsx";
let form = read(formPath);
form = replaceIfPresent(form, "Free kit allocation", "Included kit allocation");
form = replaceIfPresent(
  form,
  "The included shirts, shorts, socks and personalisation are free of charge. There is no printing charge. Additional complete kits cost £20 each.",
  "The included allocation covers shirts, shorts, socks and personalisation. Additional complete kits cost £20 each.",
);
form = replaceIfPresent(
  form,
  "{includedKitQuantity} free + {kitQuantity - includedKitQuantity} paid additional",
  "{includedKitQuantity} included + {kitQuantity - includedKitQuantity} paid additional",
);
form = replaceIfPresent(
  form,
  '{includedKitQuantity > 0 ? "Submit free kit order" : "Submit paid kit order"}',
  '"Submit kit order"',
);
write(formPath, form);

const includedPanelPath = "src/components/captain/IncludedKitPaymentPanel.tsx";
let includedPanel = read(includedPanelPath);
includedPanel = replaceIfPresent(includedPanel, "Free team kit offer", "Team kit allocation");
includedPanel = replaceIfPresent(
  includedPanel,
  "{displayedIncludedQuantity} complete kits are included free of charge",
  "Your team has {displayedIncludedQuantity} complete kits included",
);
includedPanel = replaceIfPresent(
  includedPanel,
  "The included kits cover the shirt, shorts, socks and personalisation. There is no printing charge. Additional complete kits cost £20 each.",
  "The included allocation covers the shirt, shorts, socks and personalisation. Additional complete kits cost £20 each.",
);
write(includedPanelPath, includedPanel);

if (
  !page.includes("TeamKitDesignPreferencePicker") ||
  !page.includes("saveKitDesignPreferenceAction") ||
  !page.includes("preferredKitDesignId") ||
  page.includes("Free team kit offer") ||
  form.includes("Free kit allocation") ||
  includedPanel.includes("Free team kit offer") ||
  includedPanel.includes("included free of charge")
) {
  throw new Error("Neutral captain kit flow was not applied correctly.");
}

console.log(
  "Captain kit pages now use neutral kit-order wording and show a saved design chooser before paid kit rows unlock.",
);
