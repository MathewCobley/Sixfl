const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Real prepared source; database/auth boundaries are isolated. No provider or cron is called.
function load(relative, stubs = {}, expose = []) {
  const filename = path.resolve(relative);
  const source = fs.readFileSync(filename, 'utf8') + (expose.length ? '\nmodule.exports.__test = {' + expose.join(',') + '};' : '');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const normalRequire = mod.require.bind(mod);
  mod.require = name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name === '@/lib/prisma') return { prisma: {} };
    if (name === '@/lib/requireAdmin') return { requireAdmin: async () => ({ user: { id: 'isolated-admin' } }) };
    if (name === 'next/cache') return { revalidatePath() {} };
    if (name.startsWith('@/lib/email/')) return load('src/' + name.slice(2) + '.ts', stubs);
    if (name === './renderer' || name === '@/lib/notifications/renderer') return load('src/lib/notifications/renderer.ts', stubs);
    if (name.startsWith('./') && filename.includes(path.join('lib', 'email'))) return load(path.resolve(path.dirname(filename), name + '.ts'), stubs);
    if (name.startsWith('@/') || name.startsWith('next/') || name === './recipients' || name === './sms-short-links') return {};
    return normalRequire(name);
  };
  mod._compile(output, filename);
  return mod.exports;
}
const links = load('src/lib/email/template-cta.ts');
const { renderEmailInlineFormatting: inline } = load('src/lib/email/inline-formatting.ts');
const { toggleItalicSelection: toggle } = load('src/lib/email/editor-formatting.ts');
const { buildSIXFLEmailHtml } = load('src/lib/email/buildEmail.ts');
const announcements = load('src/lib/communications/system-announcements.ts');
const queue = load('src/lib/notifications/service.ts', {}, ['buildQueuedContentFromTemplate', 'buildQueuedContentDirect', 'resolveEmailCtaUrl']).__test;
for (const [input, expected] of [
  ['*italic*', '<em>italic</em>'], ['**bold**', '<strong>bold</strong>'],
  ['***both***', '<strong><em>both</em></strong>'],
  ['**bold *inside***', '<strong>bold <em>inside</em></strong>'],
  ['*italic **inside***', '<em>italic <strong>inside</strong></em>'],
  ['*italic **inside** tail*', '<em>italic <strong>inside</strong> tail</em>'],
  ['2 * 3', '2 * 3'], ['**unfinished', '**unfinished'],
  ['first_name@example.test {{firstName}}', 'first_name@example.test {{firstName}}'],
  ['<script>*unsafe*</script>', '&lt;script&gt;<em>unsafe</em>&lt;/script&gt;'],
  ['*first*\n*second*', '<em>first</em>\n<em>second</em>'],
  ['https://example.test/?q=**&a=*', 'https://example.test/?q=**&amp;a=*'],
]) test('inline rendering: ' + JSON.stringify(input), () => assert.equal(inline(input), expected));
for (const input of ['plain text', '**bold**', '***both***', '  spaced text  ', '- first\n  - second', 'one\n\ntwo', '{{firstName}}']) {
  test('selection toggles without losing text: ' + JSON.stringify(input), () => {
    const first = toggle(input, 0, input.length);
    assert.equal(toggle(first.text, first.start, first.end).text, input);
  });
}
test('partial selection, caret and surrounding emphasis', () => {
  assert.equal(toggle('Before selected after', 7, 15).text, 'Before *selected* after');
  const result = toggle('Before after', 7, 7);
  assert.equal(result.text, 'Before *italic text*after');
  assert.equal(result.text.slice(result.start, result.end), 'italic text');
  assert.equal(toggle('*selected*', 1, 9).text, 'selected');
  assert.equal(toggle('**selected**', 2, 10).text, '***selected***');
});
test('multiline formatting preserves list indentation, blank lines and tokens', () => {
  const input = '- {{firstName}}\n\n  - second';
  assert.equal(toggle(input, 0, input.length).text, '- *{{firstName}}*\n\n  - *second*');
});
test('static referral destination never contains another account\'s code', () => {
  assert.equal(links.getStaticEmailCtaUrl(' referralPageUrl '), 'https://www.sixfl.co.uk/player/referrals');
  for (const key of [null, '', 'paymentUrl', 'javascript:alert(1)', 'referralUrl']) assert.equal(links.getStaticEmailCtaUrl(key), null);
  assert.equal(new URL(links.REFERRAL_PAGE_URL).search, '');
});
test('actual shared email renderer supports emphasis, lists and one CTA', () => {
  const html = buildSIXFLEmailHtml({ body: '**Title**\n\n- *First*\n  - **Second**\n\n{{cta}}', cta: { label: 'Get my referral link', url: links.REFERRAL_PAGE_URL } });
  assert.match(html, /<em>First<\/em>/); assert.match(html, /<strong>Title<\/strong>/); assert.match(html, /<strong>Second<\/strong>/);
  assert.equal(html.split('href="' + links.REFERRAL_PAGE_URL + '"').length - 1, 1);
  assert.doesNotMatch(html, /\{\{cta\}\}/);
});
test('announcement compatibility accepts referral but rejects personal-only destinations', () => {
  const input = { subject: 'Offer', body: 'Hello {{firstName}}\n\n{{cta}}', ctaLabel: 'Get my referral link', ctaUrlKey: links.REFERRAL_PAGE_CTA_KEY };
  assert.equal(announcements.getAnnouncementTemplateCompatibility(input).compatible, true);
  assert.equal(announcements.getAnnouncementTemplateCompatibility({ ...input, ctaUrlKey: 'paymentUrl' }).compatible, false);
  assert.equal(announcements.getAnnouncementTemplateCompatibility({ ...input, body: '{{unknownPersonToken}}' }).compatible, false);
  const resolved = announcements.resolveAnnouncementCta({ label: input.ctaLabel, urlKey: input.ctaUrlKey, dashboardUrl: 'https://example.test/dashboard', signupUrl: 'https://example.test/signup' });
  assert.deepEqual(resolved, { label: input.ctaLabel, url: links.REFERRAL_PAGE_URL });
  assert.equal(announcements.resolveAnnouncementCta({ label: '', urlKey: input.ctaUrlKey, dashboardUrl: '', signupUrl: '' }), undefined);
});
test('actual template/direct queued-content rendering has a valid button and italic text', () => {
  const template = { subject: 'Hello {{firstName}}', body: 'Hi *{{firstName}}*\n\n{{cta}}', channel: 'EMAIL', ctaLabel: 'Get my referral link', ctaUrlKey: links.REFERRAL_PAGE_CTA_KEY };
  const rendered = queue.buildQueuedContentFromTemplate({ template, variables: { firstName: 'Sample', referralPageUrl: 'https://wrong.example/?ref=another-person' } });
  assert.match(rendered.bodyHtml, /<em>Sample<\/em>/);
  assert.ok(rendered.bodyHtml.includes('href="' + links.REFERRAL_PAGE_URL + '"'));
  assert.doesNotMatch(rendered.bodyHtml, /wrong\.example|\{\{/);
  const emailCta = announcements.resolveAnnouncementCta({ label: template.ctaLabel, urlKey: template.ctaUrlKey, dashboardUrl: '', signupUrl: '' });
  const direct = queue.buildQueuedContentDirect({ channel: 'EMAIL', subject: template.subject, body: template.body, variables: { firstName: 'Another' }, emailCta });
  assert.match(direct.bodyHtml, /<em>Another<\/em>/);
  assert.ok(direct.bodyText.includes(links.REFERRAL_PAGE_URL));
  assert.ok(direct.bodyHtml.includes('href="' + links.REFERRAL_PAGE_URL + '"'));
});
for (const kind of ['campaign', 'system']) test('real ' + kind + ' create/update actions persist CTA and italic source', async () => {
  const changes = [];
  const db = { findUnique: async () => null, create: async args => { changes.push(args.data); return { id: 'isolated-template' }; }, update: async args => { changes.push(args.data); return { id: 'isolated-template' }; } };
  const actions = load(kind === 'campaign' ? 'src/app/(admin)/admin/email-templates/actions.ts' : 'src/app/(admin)/admin/system-email-templates/actions.ts', { '@/lib/prisma': { prisma: { emailTemplate: db, notificationTemplate: db } } });
  const data = new FormData();
  for (const [key, value] of Object.entries({ key: 'isolated-referral-test', name: 'Referral test', subject: 'Test subject', body: '*Italic content*\n\n{{cta}}', audience: 'GENERAL', ctaLabel: 'Get my referral link', ctaUrlKey: links.REFERRAL_PAGE_CTA_KEY, isActive: 'true' })) data.set(key, value);
  const create = kind === 'campaign' ? actions.createEmailTemplateAction : actions.createSystemEmailTemplateAction;
  const update = kind === 'campaign' ? actions.updateEmailTemplateAction : actions.updateSystemEmailTemplateAction;
  assert.equal((await create(data)).ok, true);
  data.set('id', 'isolated-template');
  assert.equal((await update(data)).ok, true);
  assert.equal(changes.length, 2);
  assert.ok(changes.every(value => value.ctaUrlKey === links.REFERRAL_PAGE_CTA_KEY && value.body.includes('*Italic content*')));
  data.set('ctaUrlKey', 'unknownDestination');
  assert.equal((await update(data)).ok, false);
  assert.equal(changes.length, 2);
});
test('reopening retains referral destination and existing CTA options', () => {
  const page = load('src/app/(admin)/admin/templates/[id]/page.tsx', {}, ['getEmailCtaUrlKey']).__test;
  assert.equal(page.getEmailCtaUrlKey(links.REFERRAL_PAGE_CTA_KEY), links.REFERRAL_PAGE_CTA_KEY);
  assert.equal(page.getEmailCtaUrlKey('paymentUrl'), 'paymentUrl');
  assert.equal(page.getEmailCtaUrlKey('unknownDestination'), undefined);
});
test('admin access is checked before storage', async () => {
  let accessed = false;
  const actions = load('src/app/(admin)/admin/email-templates/actions.ts', {
    '@/lib/requireAdmin': { requireAdmin: async () => { throw new Error('denied'); } },
    '@/lib/prisma': { prisma: new Proxy({}, { get() { accessed = true; throw new Error('unexpected access'); } }) },
  });
  await assert.rejects(() => actions.createEmailTemplateAction(new FormData()), /denied/);
  assert.equal(accessed, false);
});
for (const file of [
  'src/app/(admin)/admin/leagues/[id]/communications/page.tsx', 'src/app/(admin)/admin/messages/page.tsx',
  'src/app/(admin)/admin/player-prospects/[prospectId]/communications/page.tsx', 'src/app/(admin)/admin/teams/[id]/page.tsx',
  'src/app/(admin)/admin/teams/[id]/players/[membershipId]/communications/page.tsx', 'src/app/(admin)/admin/teams/[id]/prospects/[prospectId]/communications/page.tsx',
]) test('native composer destination: ' + file, () => {
  const tree = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'ctaUrl' && node.initializer?.getText(tree).includes('template.ctaUrlKey')) expression = node.initializer.getText(tree);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(expression);
  const evaluate = new Function('template', 'REFERRAL_PAGE_CTA_KEY', 'REFERRAL_PAGE_URL', 'return (' + expression + ');');
  assert.equal(evaluate({ ctaUrlKey: links.REFERRAL_PAGE_CTA_KEY }, links.REFERRAL_PAGE_CTA_KEY, links.REFERRAL_PAGE_URL), links.REFERRAL_PAGE_URL);
});
test('native form wiring; no production source-preparation dependency', () => {
  const form = fs.readFileSync('src/components/admin/email-templates/EmailTemplateForm.tsx', 'utf8');
  assert.match(form, /onClick=\{insertItalicText\}/); assert.match(form, /toggleItalicSelection/);
  assert.match(form, /label: "Referral page"/); assert.match(form, /event\.ctrlKey \|\| event\.metaKey/);
  assert.equal(fs.existsSync('scripts/prepare-editor-branch.cjs'), false);
  assert.equal(fs.existsSync('.github/workflows/editor-branch-preparation.yml'), false);
});
