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
  "message creator and dispatch query",
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
    "                    dispatch: message.dispatch",
    "                      ? {",
    "                          id: message.dispatch.id,",
    "                          template: message.dispatch.template",
    "                            ? {",
    "                                id: message.dispatch.template.id,",
    "                                name: message.dispatch.template.name,",
    "                                key: message.dispatch.template.key,",
    "                              }",
    "                            : null,",
    "                          metadata: message.dispatch.metadata,",
    "                        }",
    "                      : null,",
    "                  })),",
  ].join("\n"),
  "message creator and dispatch mapping",
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
    "function getDispatchMetadataRecord(",
    '  message: NonNullable<SelectedThread>["messages"][number],',
    ") {",
    "  const metadata = message.dispatch?.metadata;",
    '  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {',
    "    return null;",
    "  }",
    "  return metadata as Record<string, unknown>;",
    "}",
    "",
    "function getDispatchMetadataString(",
    '  message: NonNullable<SelectedThread>["messages"][number],',
    "  key: string,",
    ") {",
    "  const value = getDispatchMetadataRecord(message)?.[key];",
    '  return typeof value === "string" && value.trim() ? value.trim() : null;',
    "}",
    "",
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
    '    getDispatchMetadataString(message, "actorName") ||',
    "    null;",
    '  const actorRole = getDispatchMetadataString(message, "actorRole")?.toUpperCase();',
    '  const origin = getDispatchMetadataString(message, "origin");',
    "",
    "  if (",
    '    actorRole === "CAPTAIN" ||',
    "    (origin === \"captain_availability_sms_chase\" &&",
    '      message.createdByUser?.role !== "ADMIN")',
    "  ) {",
    '    return creatorName ? `Captain · ${creatorName}` : "Captain";',
    "  }",
    "",
    '  if (actorRole === "ADMIN" || message.createdByUser?.role === "ADMIN") {',
    '    return creatorName ? `SIXFL admin · ${creatorName}` : "SIXFL admin";',
    "  }",
    "",
    "  if (creatorName) return `Sent by ${creatorName}`;",
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

replaceOnce(
  threadPath,
  [
    '  if (message.direction === "INBOUND") {',
    "    return null;",
    "  }",
    "",
    "  if (message.dispatch?.template) {",
  ].join("\n"),
  [
    '  if (message.direction === "INBOUND") {',
    "    return null;",
    "  }",
    "",
    '  const originLabel = getDispatchMetadataString(message, "originLabel");',
    "  if (originLabel) {",
    "    return {",
    "      label: originLabel,",
    "      key: null,",
    "    };",
    "  }",
    "",
    "  if (message.dispatch?.template) {",
  ].join("\n"),
  "visible message action source",
);

for (const filePath of [servicePath, pagePath, inboxPath, threadPath]) {
  const source = read(filePath);
  if (!source.includes("createdByUser")) {
    throw new Error(`Message creator attribution missing from ${filePath}`);
  }
}

const threadSource = read(threadPath);
if (
  !threadSource.includes("SIXFL admin · ${creatorName}") ||
  !threadSource.includes("Captain · ${creatorName}") ||
  !threadSource.includes('getDispatchMetadataString(message, "originLabel")')
) {
  throw new Error("Named sender or action-source labels were not added.");
}

console.log(
  "The admin communications timeline now identifies the actual sender and the action that generated each notification.",
);
