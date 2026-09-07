// One-time source editing aid; this file and its workflow are removed before merge.
const fs = require('node:fs');
function replace(file, before, after) {
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes(after)) return;
  if (source.split(before).length !== 2) throw new Error(`Expected one anchor: ${file}: ${before.slice(0, 100)}`);
  fs.writeFileSync(file, source.replace(before, after));
}
function addImport(file) {
  const line = 'import { REFERRAL_PAGE_CTA_KEY, REFERRAL_PAGE_URL } from "@/lib/email/template-cta";\n';
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes(line)) return;
  fs.writeFileSync(file, source.includes('"use server";')
    ? source.replace('"use server";', '"use server";\n\n' + line)
    : line + source);
}
const pages = [
 'src/app/(admin)/admin/leagues/[id]/communications/page.tsx',
 'src/app/(admin)/admin/messages/page.tsx',
 'src/app/(admin)/admin/player-prospects/[prospectId]/communications/page.tsx',
 'src/app/(admin)/admin/teams/[id]/page.tsx',
 'src/app/(admin)/admin/teams/[id]/players/[membershipId]/communications/page.tsx',
 'src/app/(admin)/admin/teams/[id]/prospects/[prospectId]/communications/page.tsx',
];
for (const file of pages) {
  addImport(file);
  replace(file, '      template.ctaUrlKey === "signupUrl"', '      template.ctaUrlKey === REFERRAL_PAGE_CTA_KEY\n        ? REFERRAL_PAGE_URL\n        : template.ctaUrlKey === "signupUrl"');
}
for (const file of ['src/app/(admin)/admin/leads/[id]/actions.ts', 'src/app/(admin)/admin/messaging/actions.ts']) {
  addImport(file);
  replace(file, '  if (!label || !urlKey) {\n    return undefined;\n  }\n\n  if (urlKey === "signupUrl")', '  if (!label || !urlKey) {\n    return undefined;\n  }\n\n  if (urlKey === REFERRAL_PAGE_CTA_KEY) return { label, url: REFERRAL_PAGE_URL };\n\n  if (urlKey === "signupUrl")');
}
const bulk = 'src/app/(admin)/admin/leads/actions.ts';
addImport(bulk);
replace(bulk, '  const resolvedCta: SIXFLEmailCta | undefined =\n    ctaUrlKey === "teamJoinUrl"', '  const resolvedCta: SIXFLEmailCta | undefined =\n    ctaUrlKey === REFERRAL_PAGE_CTA_KEY\n      ? ctaLabel ? { label: ctaLabel, url: REFERRAL_PAGE_URL } : undefined\n      : ctaUrlKey === "teamJoinUrl"');
const teams = 'src/app/(admin)/admin/messaging/teams/page.tsx';
addImport(teams);
replace(teams, '  switch (ctaUrlKey) {', '  if (ctaUrlKey === REFERRAL_PAGE_CTA_KEY) return REFERRAL_PAGE_URL;\n  switch (ctaUrlKey) {');
console.log('All inventoried generic email-template CTA consumers now resolve the shared referral destination.');
