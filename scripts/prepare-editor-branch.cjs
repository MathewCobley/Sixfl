// One-time remote editing aid; removed from the final PR before merge.
// Native product sources are committed. This is NOT a production prebuild hook.
const fs = require('node:fs');
const path = require('node:path');
function replace(file, before, after) {
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes(after)) return;
  if (source.split(before).length !== 2) throw new Error(`Expected exactly one anchor: ${file}: ${before.slice(0, 100)}`);
  fs.writeFileSync(file, source.replace(before, after));
}
function write(file, content) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
const ctaImport = 'import { getStaticEmailCtaUrl } from "@/lib/email/template-cta";\n';
write('src/lib/email/template-cta.ts', `/** A shared public destination, not somebody else's personal referral code. */
export const REFERRAL_PAGE_CTA_KEY = "referralPageUrl";
export const REFERRAL_PAGE_URL = "https://www.sixfl.co.uk/player/referrals";

export function getStaticEmailCtaUrl(key: string | null | undefined): string | null {
  return key?.trim() === REFERRAL_PAGE_CTA_KEY ? REFERRAL_PAGE_URL : null;
}
`);
write('src/lib/email/inline-formatting.ts', String.raw`type Emphasis = { marker: 1 | 2; closed: boolean; children: Array<string | Emphasis> };
function escape(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

/** Small, bounded inline parser. Only balanced *, ** and *** become markup.
 * URLs, unmatched markers, underscores and template tokens remain text.
 * All source text is HTML-escaped; raw HTML is never accepted. */
export function renderEmailInlineFormatting(value: string): string {
  return value.split("\n").map(renderLine).join("\n");
}
function renderLine(value: string): string {
  const root: Emphasis = { marker: 1, closed: false, children: [] };
  const stack = [root];
  const append = (text: string) => {
    const children = stack[stack.length - 1].children;
    const last = children.length - 1;
    if (typeof children[last] === "string") children[last] += text;
    else children.push(text);
  };
  for (let i = 0; i < value.length;) {
    const url = /^(?:https?:\/\/|www\.)[^\s<>]+/i.exec(value.slice(i));
    if (url) { append(url[0]); i += url[0].length; continue; }
    if (value[i] !== "*") { append(value[i++]); continue; }
    let end = i;
    while (value[end] === "*") end++;
    let remaining = end - i;
    if (remaining > 3) { append(value.slice(i, end)); i = end; continue; }
    const canClose = i > 0 && !/\s/.test(value[i - 1]);
    const canOpen = end < value.length && !/\s/.test(value[end]);
    if (canClose) {
      while (stack.length > 1 && remaining >= stack[stack.length - 1].marker) {
        const node = stack.pop()!;
        node.closed = true;
        remaining -= node.marker;
      }
    }
    if (remaining && canOpen && stack.length < 16) {
      for (const marker of (remaining === 3 ? [2, 1] : [remaining]) as Array<1 | 2>) {
        const node: Emphasis = { marker, closed: false, children: [] };
        stack[stack.length - 1].children.push(node);
        stack.push(node);
      }
    } else if (remaining) append("*".repeat(remaining));
    i = end;
  }
  function render(children: Emphasis["children"]): string {
    return children.map(node => {
      if (typeof node === "string") return escape(node);
      const body = render(node.children);
      if (!node.closed) return "*".repeat(node.marker) + body;
      return node.marker === 2 ? "<strong>" + body + "</strong>" : "<em>" + body + "</em>";
    }).join("");
  }
  return render(root.children);
}
`.replaceAll('\\n', '\n').replaceAll('\\s', '\s').replaceAll('\\/', '\/').replaceAll('\\.', '\.'));
write('src/lib/email/editor-formatting.ts', String.raw`export type TextSelection = { text: string; start: number; end: number };
function hasItalicWrapper(value: string) {
  return value.startsWith("*") && value.endsWith("*") && value.length > 2 &&
    ((!value.startsWith("**") && !value.endsWith("**")) ||
      (value.startsWith("***") && value.endsWith("***") && !value.startsWith("****")));
}

/** Toggle italics without changing the rest of the draft, newlines or list markers. */
export function toggleItalicSelection(text: string, start: number, end: number): TextSelection {
  start = Math.max(0, Math.min(text.length, start));
  end = Math.max(start, Math.min(text.length, end));
  if (start === end) {
    const placeholder = "italic text";
    return { text: text.slice(0, start) + "*" + placeholder + "*" + text.slice(end),
      start: start + 1, end: start + 1 + placeholder.length };
  }
  const selected = text.slice(start, end);
  const leftStars = /\*+$/.exec(text.slice(0, start))?.[0].length ?? 0;
  const rightStars = /^\*+/.exec(text.slice(end))?.[0].length ?? 0;
  if (leftStars % 2 === 1 && rightStars % 2 === 1) {
    return { text: text.slice(0, start - 1) + selected + text.slice(end + 1), start: start - 1, end: end - 1 };
  }
  const lines = selected.split("\n");
  const parts = lines.map(line => /^(\s*(?:-\s+|\d+\.\s+)?)(.*?)(\s*)$/.exec(line)!);
  const nonempty = parts.filter(part => part[2]);
  if (!nonempty.length) return { text, start, end };
  const remove = nonempty.every(part => hasItalicWrapper(part[2]));
  const replacement = parts.map(part => {
    if (!part[2]) return part[0];
    return part[1] + (remove ? part[2].slice(1, -1) : "*" + part[2] + "*") + part[3];
  }).join("\n");
  return { text: text.slice(0, start) + replacement + text.slice(end), start, end: start + replacement.length };
}
`.replaceAll('\\n', '\n').replaceAll('\\s', '\s').replaceAll('\\*', '\*').replaceAll('\\d', '\d').replaceAll('\\.', '\.'));
const form = 'src/components/admin/email-templates/EmailTemplateForm.tsx';
replace(form, 'import { buildSIXFLEmailHtml } from "@/lib/email/buildEmail";', 'import { buildSIXFLEmailHtml } from "@/lib/email/buildEmail";\nimport { REFERRAL_PAGE_URL } from "@/lib/email/template-cta";\nimport { toggleItalicSelection } from "@/lib/email/editor-formatting";');
replace(form, '  | "fixturesUrl";', '  | "fixturesUrl"\n  | "referralPageUrl";');
replace(form, '  { value: "", label: "No button" },', '  { value: "", label: "No button" },\n  { value: "referralPageUrl", label: "Referral page", previewUrl: REFERRAL_PAGE_URL },');
replace(form, '  function insertBulletText() {', '  function insertItalicText() {\n    const textarea = bodyRef.current;\n    const result = toggleItalicSelection(body, textarea?.selectionStart ?? body.length, textarea?.selectionEnd ?? body.length);\n    setBodyAndSelection(result.text, result.start, result.end);\n  }\n\n  function insertBulletText() {');
replace(form, '  function handleBodyKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {', '  function handleBodyKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {\n    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "i") {\n      event.preventDefault();\n      insertItalicText();\n      return;\n    }');
replace(form, '                    <button\n                      type="button"\n                      onClick={insertBulletText}', '                    <button\n                      type="button"\n                      onClick={insertItalicText}\n                      aria-label="Italics"\n                      title="Italicise selected text (Ctrl+I or Command+I)"\n                      className="inline-flex items-center rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm italic text-white transition hover:border-emerald-400/35 hover:bg-emerald-500/10 hover:text-emerald-100"\n                    >\n                      Italics\n                    </button>\n                    <button\n                      type="button"\n                      onClick={insertBulletText}');
replace(form, 'Highlight text and click Bold or Bullet.', 'Highlight text and click Bold, Italics or Bullet. Italics also supports Ctrl+I / Command+I.');
replace(form, '                {state?.errors?.ctaUrlKey?.[0] ? (', '                {ctaUrlKey === "referralPageUrl" ? (\n                  <p className="mt-3 text-xs leading-5 text-neutral-400">Opens the referral page, where each person signs in to get their own referral code and sharing link.</p>\n                ) : null}\n                {state?.errors?.ctaUrlKey?.[0] ? (');
for (const file of ['src/app/(admin)/admin/email-templates/actions.ts', 'src/app/(admin)/admin/system-email-templates/actions.ts']) {
  replace(file, '  "fixturesUrl",\n] as const;', '  "fixturesUrl",\n  "referralPageUrl",\n] as const;');
}
const editPage = 'src/app/(admin)/admin/templates/[id]/page.tsx';
replace(editPage, '  | "squadActivationUrl"\n  | "fixtureUrl"\n  | "fixturesUrl";', '  | "squadActivationUrl"\n  | "fixtureUrl"\n  | "fixturesUrl"\n  | "referralPageUrl";');
replace(editPage, '    value === "squadActivationUrl" ||\n    value === "fixtureUrl" ||\n    value === "fixturesUrl"', '    value === "squadActivationUrl" ||\n    value === "fixtureUrl" ||\n    value === "fixturesUrl" ||\n    value === "referralPageUrl"');
const email = 'src/lib/email/buildEmail.ts';
replace(email, 'import {\n  SIXFL_EMAIL_SIGNATURE_TEXT,', 'import { renderEmailInlineFormatting } from "./inline-formatting";\n\nimport {\n  SIXFL_EMAIL_SIGNATURE_TEXT,');
const emailSource = fs.readFileSync(email, 'utf8');
const a = emailSource.indexOf('function renderInlineFormatting(value: string) {');
const b = emailSource.indexOf('\nfunction normalizeLineEndings', a);
if (a < 0 || b < 0) throw new Error('Missing inline renderer anchor');
fs.writeFileSync(email, emailSource.slice(0, a) + 'function renderInlineFormatting(value: string) {\n  return renderEmailInlineFormatting(value);\n}\n' + emailSource.slice(b));
const queue = 'src/lib/notifications/service.ts';
replace(queue, 'import { getUnpublishedFixtureBlockReason }', ctaImport + 'import { getUnpublishedFixtureBlockReason }');
replace(queue, '  const rawValue = input.variables?.[key];', '  const staticUrl = getStaticEmailCtaUrl(key);\n  if (staticUrl) return staticUrl;\n\n  const rawValue = input.variables?.[key];');
const announcements = 'src/lib/communications/system-announcements.ts';
replace(announcements, 'import { createHash } from "crypto";', 'import { createHash } from "crypto";\n' + ctaImport);
replace(announcements, '!["captainDashboardUrl", "signupUrl"].includes(input.ctaUrlKey)', '!["captainDashboardUrl", "signupUrl"].includes(input.ctaUrlKey) &&\n    !getStaticEmailCtaUrl(input.ctaUrlKey)');
replace(announcements, '  if (!label || !key) return undefined;', '  if (!label || !key) return undefined;\n  const staticUrl = getStaticEmailCtaUrl(key);\n  if (staticUrl) return { label, url: staticUrl };');
console.log('Native editor, validation, shared renderer, queue and announcement edits prepared.');
