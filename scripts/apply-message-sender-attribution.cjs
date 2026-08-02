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
  "    createdByUser: {",
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
    "message creator type",
  );
}

replaceOnce(
  threadPath,
  [
    "function getMessageRoleLabel(",
    '  message: NonNullable<SelectedThread>["messages"][number],',
    "): string {",
    '  if (message.direction === "INBOUND") {',
    '    return "Contact";',
    "  }",
    "",
    "  switch (message.participantRole) {",
    '    case "ADMIN":',
    '      return "SIXFL admin";',
    '    case "CAPTAIN":',
    '      return "Captain";',
    '    case "SYSTEM":',
    '      return "Automated";',
    "    default:",
    '      return "SIXFL";',
    "  }",
    "}",
  ].join("\n"),
  [
    "function getMessageRoleLabel(",
    '  message: NonNullable<SelectedThread>["messages"][number],',
    "): string {",
    '  if (message.direction === "INBOUND") {',
    '    return "Contact";',
    "  }",
    "",
    "  const creatorName =",
    "    message.createdByUser?.name?.trim() ||",
    "    message.createdByUser?.email?.trim() ||",
    "    null;",
    "",
    "  if (creatorName) {",
    '    return message.createdByUser?.role === "ADMIN"',
    '      ? `SIXFL admin · ${creatorName}`',
    '      : `Sent by ${creatorName}`;',
    "  }",
    "",
    "  switch (message.participantRole) {",
    '    case "ADMIN":',
    '      return "SIXFL admin";',
    '    case "CAPTAIN":',
    '      return "Captain";',
    '    case "SYSTEM":',
    '      return "Automated";',
    "    default:",
    '      return "SIXFL";',
    "  }",
    "}",
  ].join("\n"),
  "visible message creator label",
);

for (const filePath of [servicePath, pagePath, inboxPath, threadPath]) {
  const source = read(filePath);
  if (!source.includes("createdByUser")) {
    throw new Error(`Message creator attribution missing from ${filePath}`);
  }
}

if (!read(threadPath).includes("SIXFL admin · ${creatorName}")) {
  throw new Error("Named sender label was not added to the admin timeline.");
}

console.log(
  "Manual messages in the admin timeline now identify the user account that triggered them.",
);
