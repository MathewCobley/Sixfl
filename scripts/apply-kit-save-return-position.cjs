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

const pagePath = "src/app/(admin)/admin/kits/page.tsx";
const actionsPath = "src/app/(admin)/admin/kits/actions.ts";

replaceOnce(
  actionsPath,
  [
    "function redirectToKits(input: {",
    "  notice?: string;",
    "  error?: string;",
    "  code?: string | null;",
    "  team?: string | null;",
    "}) {",
    "  const params = new URLSearchParams();",
    '  if (input.notice) params.set("notice", input.notice);',
    '  if (input.error) params.set("error", input.error);',
    '  if (input.code) params.set("code", input.code);',
    '  if (input.team) params.set("team", input.team);',
    "  const query = params.toString();",
    '  return `${KITS_PATH}${query ? `?${query}` : ""}`;',
    "}",
  ].join("\n"),
  [
    "function redirectToKits(input: {",
    "  notice?: string;",
    "  error?: string;",
    "  code?: string | null;",
    "  team?: string | null;",
    "  q?: string | null;",
    "  page?: number | null;",
    "  anchor?: string | null;",
    "}) {",
    "  const params = new URLSearchParams();",
    '  if (input.notice) params.set("notice", input.notice);',
    '  if (input.error) params.set("error", input.error);',
    '  if (input.code) params.set("code", input.code);',
    '  if (input.team) params.set("team", input.team);',
    '  if (input.q) params.set("q", input.q);',
    '  if (input.page && input.page > 1) params.set("page", String(input.page));',
    "  const query = params.toString();",
    '  const hash = input.anchor ? `#${encodeURIComponent(input.anchor)}` : "";',
    '  return `${KITS_PATH}${query ? `?${query}` : ""}${hash}`;',
    "}",
  ].join("\n"),
  "kit redirect query and anchor support",
);

replaceOnce(
  actionsPath,
  [
    '  const id = readString(formData, "id");',
    '  const code = readString(formData, "code");',
    '  const sortOrder = Number(readString(formData, "sortOrder") || 0);',
  ].join("\n"),
  [
    '  const id = readString(formData, "id");',
    '  const code = readString(formData, "code");',
    '  const sortOrder = Number(readString(formData, "sortOrder") || 0);',
    '  const returnQ = readString(formData, "returnQ") || null;',
    '  const parsedReturnPage = Number(readString(formData, "returnPage") || 1);',
    "  const returnPage =",
    "    Number.isInteger(parsedReturnPage) && parsedReturnPage > 0",
    "      ? parsedReturnPage",
    "      : 1;",
    '  const returnAnchor = id ? `kit-design-${id}` : null;',
  ].join("\n"),
  "kit design return state",
);

replaceOnce(
  actionsPath,
  '    redirect(redirectToKits({ error: "invalid_design" }));',
  [
    "    redirect(",
    "      redirectToKits({",
    '        error: "invalid_design",',
    "        q: returnQ,",
    "        page: returnPage,",
    "        anchor: returnAnchor,",
    "      }),",
    "    );",
  ].join("\n"),
  "invalid kit design return position",
);

replaceOnce(
  actionsPath,
  '    redirect(redirectToKits({ error: knownDatabaseError(error), code }));',
  [
    "    redirect(",
    "      redirectToKits({",
    "        error: knownDatabaseError(error),",
    "        code,",
    "        q: returnQ,",
    "        page: returnPage,",
    "        anchor: returnAnchor,",
    "      }),",
    "    );",
  ].join("\n"),
  "failed kit save return position",
);

replaceOnce(
  actionsPath,
  '  redirect(redirectToKits({ notice: "design_saved", code }));',
  [
    "  redirect(",
    "    redirectToKits({",
    '      notice: "design_saved",',
    "      code,",
    "      q: returnQ,",
    "      page: returnPage,",
    "      anchor: returnAnchor,",
    "    }),",
    "  );",
  ].join("\n"),
  "successful kit save return position",
);

replaceOnce(
  pagePath,
  [
    "              <form",
    "                key={design.id}",
    "                action={updateKitDesignAction}",
    '                className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]"',
    "              >",
    '                <input type="hidden" name="id" value={design.id} />',
  ].join("\n"),
  [
    "              <form",
    "                key={design.id}",
    "                id={`kit-design-${design.id}`}",
    "                action={updateKitDesignAction}",
    '                className="scroll-mt-6 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]"',
    "              >",
    '                <input type="hidden" name="id" value={design.id} />',
    '                <input type="hidden" name="returnQ" value={value(sp.q)} />',
    "                <input",
    '                  type="hidden"',
    '                  name="returnPage"',
    "                  value={String(currentPage)}",
    "                />",
  ].join("\n"),
  "kit card anchor and return state",
);

const actions = read(actionsPath);
const page = read(pagePath);

if (!/returnAnchor|returnPage|returnQ/.test(actions)) {
  throw new Error("Kit save redirect state was not added.");
}

if (!/id={`kit-design-\$\{design\.id\}`}|name="returnPage"|name="returnQ"/.test(page)) {
  throw new Error("Kit card anchor or return fields were not added.");
}

console.log(
  "Admin kit saves now return to the same catalogue page and scroll back to the kit that was saved.",
);
