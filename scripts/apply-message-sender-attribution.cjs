const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const servicePath = "src/lib/messaging/service.ts";
const absolutePath = path.join(root, servicePath);
let source = fs.readFileSync(absolutePath, "utf8");

const before =
  '      messages: { orderBy: [{ createdAt: "asc" }], include: { dispatch: { select: { id: true, template: { select: { id: true, name: true, key: true } }, metadata: true } } } },';
const after = [
  "      messages: {",
  '        orderBy: [{ createdAt: "asc" }],',
  "        include: {",
  "          createdByUser: {",
  "            select: { id: true, name: true, email: true, role: true },",
  "          },",
  "          dispatch: {",
  "            select: {",
  "              id: true,",
  "              template: { select: { id: true, name: true, key: true } },",
  "              metadata: true,",
  "            },",
  "          },",
  "        },",
  "      },",
].join("\n");

if (!source.includes(after)) {
  if (!source.includes(before)) {
    throw new Error(
      "Expected message-thread dispatch query was not found in src/lib/messaging/service.ts",
    );
  }
  source = source.replace(before, after);
  fs.writeFileSync(absolutePath, source, "utf8");
}

if (!fs.readFileSync(absolutePath, "utf8").includes("createdByUser")) {
  throw new Error("Message creator relation was not added to the thread query.");
}

console.log("Loaded message creator details with admin conversation threads.");
