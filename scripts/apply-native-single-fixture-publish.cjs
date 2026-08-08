const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(
  process.cwd(),
  "src",
  "components",
  "admin",
  "fixtures",
  "FixturesAdminScreen.tsx",
);

let source = fs.readFileSync(filePath, "utf8");

const importLine =
  'import PublishSingleFixtureButton from "@/components/admin/fixtures/PublishSingleFixtureButton";';
const importAnchor =
  'import { FixtureConfirmationChaseButton } from "@/components/admin/fixtures/FixtureConfirmationChaseButton";';

if (!source.includes(importLine)) {
  if (!source.includes(importAnchor)) {
    throw new Error("Could not find fixture confirmation import anchor.");
  }
  source = source.replace(importAnchor, `${importAnchor}\n${importLine}`);
}

const actionAnchor = `                    <td className="px-6 py-5 text-right">\n                      <div className="flex justify-end gap-2">\n                        <button`;
const actionReplacement = `                    <td className="px-6 py-5 text-right">\n                      <div className="flex flex-wrap justify-end gap-2">\n                        {!fixture.publishedAtIso ? (\n                          <PublishSingleFixtureButton fixtureId={fixture.id} />\n                        ) : null}\n\n                        <button`;

if (!source.includes("<PublishSingleFixtureButton fixtureId={fixture.id}")) {
  if (!source.includes(actionAnchor)) {
    throw new Error("Could not find fixture action row anchor.");
  }
  source = source.replace(actionAnchor, actionReplacement);
}

if (
  !source.includes(importLine) ||
  !source.includes("<PublishSingleFixtureButton fixtureId={fixture.id}")
) {
  throw new Error("Native single-fixture publish control was not applied.");
}

fs.writeFileSync(filePath, source, "utf8");
console.log("Applied native single-fixture publish control.");
