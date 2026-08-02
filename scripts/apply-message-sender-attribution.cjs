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

const servicePath = "src/lib/messaging/service.ts";
const pagePath = "src/app/(admin)/admin/messaging/page.tsx";
const inboxPath = "src/components/admin/messages/AdminMessagesInbox.tsx";
const threadPath = "src/components/admin/messages/AdminMessageThread.tsx";

replaceOnce(
  servicePath,
  '      messages: { orderBy: [{ createdAt: "asc" }], include: { dispatch: { select: { id: true, template: { select: { id: true, name: true, key: true } }, metadata: true } } } },',
  [
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
  ].join("\n"),
  "message creator query",
);

replaceOnce(
  pagePath,
  [
    "                    readAt: message.readAt?.toISOString() ?? null,",
    "                  })),",
  ].join("\n"),
  [
    "                    readAt: message.readAt?.toISOString() ?? null,",
    "                    createdByUser: message.createdByUser",
    "                      ? {",
    "                          id: message.createdByUser.id,",
    "                          name: message.createdByUser.name,",
    "                          email: message.createdByUser.email,",
    "                          role: message.createdByUser.role,",
    "                        }",
    "                      : null,",
    "                  })),",
  ].join("\n"),
  "message creator mapping",
);

const creatorType = [
  "    createdByUser?: {",
  "      id: string;",
  "      name: string | null;",
  "      email: string | null;",
  '      role: "USER" | "REFEREE" | "ADMIN";',
  "    } | null;",
].join("\n");

for (const filePath of [inboxPath, threadPath]) {
  replaceOnce(
    filePath,
    [
      "    readAt: string | null;",
      "    createdAt: string;",
      "    dispatch?: {",
    ].join("\n"),
    [
      "    readAt: string | null;",
      "    createdAt: string;",
      creatorType,
      "    dispatch?: {",
    ].join("\n"),
    "optional message creator type",
  );
}

for (const filePath of [servicePath, pagePath, inboxPath, threadPath]) {
  if (!read(filePath).includes("createdByUser")) {
    throw new Error(`Message creator data missing from ${filePath}`);
  }
}

console.log("Message creator details now flow into the admin conversation component.");
