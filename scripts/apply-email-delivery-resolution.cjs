const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(
  process.cwd(),
  "src/app/(admin)/admin/delivery-issues/page.tsx",
);
let source = fs.readFileSync(pagePath, "utf8");

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  source = source.replace(before, after);
}

replaceOnce(
  'import { prisma } from "@/lib/prisma";',
  [
    'import { resolveEmailDeliveryIssueAction } from "./actions";',
    'import { prisma } from "@/lib/prisma";',
  ].join("\n"),
  "delivery issue resolution action import",
);

replaceOnce(
  [
    "export default async function DeliveryIssuesPage() {",
    "  await requireAdmin();",
  ].join("\n"),
  [
    "export default async function DeliveryIssuesPage({",
    "  searchParams,",
    "}: {",
    "  searchParams?: Promise<{ resolved?: string; error?: string }>;",
    "}) {",
    "  await requireAdmin();",
    "  const sp = (await searchParams) ?? {};",
  ].join("\n"),
  "delivery issues search params",
);

replaceOnce(
  '    <div className="space-y-7 pb-12">\n      <section className="rounded-3xl border border-red-400/20 bg-red-500/[0.07] p-6 sm:p-8">',
  [
    '    <div className="space-y-7 pb-12">',
    '      {sp.resolved === "1" ? (',
    '        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-100">',
    '          Delivery issue cleared. The previous failure remains in the audit history, and this warning will return automatically if a new email fails.',
    '        </div>',
    '      ) : sp.error ? (',
    '        <div className="rounded-2xl border border-red-400/25 bg-red-500/10 px-5 py-4 text-sm text-red-100">',
    '          That delivery issue could not be cleared. Refresh the page and try again.',
    '        </div>',
    '      ) : null}',
    '',
    '      <section className="rounded-3xl border border-red-400/20 bg-red-500/[0.07] p-6 sm:p-8">',
  ].join("\n"),
  "delivery issue result notice",
);

replaceOnce(
  [
    '                  <div className="flex shrink-0 flex-wrap gap-2 lg:max-w-[240px] lg:justify-end">',
    '                    {href ? (',
  ].join("\n"),
  [
    '                  <div className="flex shrink-0 flex-wrap gap-2 lg:max-w-[260px] lg:justify-end">',
    '                    <form action={resolveEmailDeliveryIssueAction} className="w-full">',
    '                      <input type="hidden" name="recipientId" value={recipient.id} />',
    '                      <button',
    '                        type="submit"',
    '                        className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"',
    '                      >',
    '                        Mark corrected & clear warning',
    '                      </button>',
    '                      <p className="mt-2 text-xs leading-5 text-white/45">',
    '                        Use this after correcting or confirming the email address. Any new failure will reopen the warning automatically.',
    '                      </p>',
    '                    </form>',
    '                    {href ? (',
  ].join("\n"),
  "delivery issue clear button",
);

fs.writeFileSync(pagePath, source, "utf8");

if (
  !source.includes("resolveEmailDeliveryIssueAction") ||
  !source.includes("Mark corrected & clear warning") ||
  !source.includes("Delivery issue cleared")
) {
  throw new Error("Delivery issue resolution controls were not applied.");
}

console.log(
  "Delivery issues can now be marked corrected, clearing the live warning while preserving history.",
);
