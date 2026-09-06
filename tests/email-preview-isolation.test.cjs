const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { default: EmailHtmlPreview, buildEmailPreviewDocument, renderPreview, load, root } = require("./helpers/email-preview-render.cjs");

const consumers = [
  "src/app/(admin)/admin/leads/[id]/layout.tsx",
  "src/app/(admin)/admin/leagues/[id]/communications/page.tsx",
  "src/app/(admin)/admin/player-prospects/[prospectId]/communications/page.tsx",
  "src/app/(admin)/admin/teams/[id]/page.tsx",
  "src/app/(admin)/admin/teams/[id]/players/[membershipId]/communications/page.tsx",
  "src/app/(admin)/admin/teams/[id]/prospects/[prospectId]/communications/page.tsx",
  "src/app/(admin)/admin/queue/[id]/page.tsx",
  "src/components/admin/email-templates/EmailTemplateForm.tsx",
  "src/components/admin/messages/AdminMessageThread.tsx",
];

test("full email documents are preserved inside srcDoc, never injected into the parent markup", () => {
  const email = '<html><head><style>body,header{height:900px!important}</style></head><body>Stored email</body></html>';
  const markup = renderPreview(email);
  assert.equal((markup.match(/<iframe\b/g) ?? []).length, 1);
  assert.ok(markup.includes('&lt;style&gt;'));
  assert.equal(markup.includes('<style>'), false);
  assert.ok(buildEmailPreviewDocument(email).includes(email));
  assert.ok(EmailHtmlPreview({ html: email }).props.srcDoc.includes(email));
});

test("sandbox keeps scripts, forms, same-origin DOM access and top navigation disabled", () => {
  const props = EmailHtmlPreview({ html: '<script>parent.location="https://example.com"</script>' }).props;
  assert.equal(props.sandbox, "allow-popups allow-popups-to-escape-sandbox");
  for (const permission of ["allow-scripts", "allow-forms", "allow-same-origin", "allow-top-navigation"]) {
    assert.equal(props.sandbox.includes(permission), false);
  }
  assert.equal(props.referrerPolicy, "no-referrer");
  assert.ok(props.srcDoc.indexOf("script-src 'none'") < props.srcDoc.indexOf("<script>"));
  assert.ok(props.srcDoc.includes("form-action 'none'"));
  assert.ok(props.srcDoc.includes('<base target="_blank">'));
});

test("server rendering escapes attempted attribute and iframe breakouts", () => {
  const html = '\"></iframe><style>header{display:none}</style><iframe src="https://example.com">';
  const markup = renderPreview(html, { title: '\"><script>alert(1)</script>' });
  assert.equal((markup.match(/<iframe\b/g) ?? []).length, 1);
  assert.equal((markup.match(/<\/iframe>/g) ?? []).length, 1);
  assert.equal(markup.includes('<script>'), false);
});

test("long messages have a bounded, responsive, keyboard-accessible scrollable frame", () => {
  const normal = EmailHtmlPreview({ html: "<p>Message</p>" }).props;
  const expanded = EmailHtmlPreview({ html: "<p>Message</p>", expanded: true }).props;
  assert.equal(normal.title, "Email preview");
  assert.equal(normal.loading, "lazy");
  assert.ok(normal.className.includes("w-full"));
  assert.ok(normal.className.includes("min-w-0"));
  assert.equal(normal.style.height, "28rem");
  assert.equal(normal.style.maxHeight, "75vh");
  assert.equal(expanded.style.height, "48rem");
  assert.equal(normal.tabIndex, undefined); // Keep the iframe in normal keyboard navigation.
});

test("the real SIXFL renderer retains its email layout without exposing global rules to admin", () => {
  const { buildSIXFLEmailHtml } = load("src/lib/email/buildEmail.ts");
  const html = buildSIXFLEmailHtml({ body: "Hi everyone,\n\nFixture update for our test team.", cta: { label: "View fixture", url: "https://example.com/fixture" } });
  assert.ok(html.includes("html, body"));
  assert.ok(html.includes("table-layout: fixed"));
  const markup = renderPreview(html);
  assert.ok(markup.includes("Fixture update for our test team."));
  assert.equal(markup.includes("<style>"), false);
  assert.ok(EmailHtmlPreview({ html }).props.srcDoc.includes(html));
});

test("every existing admin message, template and queue preview uses the shared component after prebuild", () => {
  for (const file of consumers) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.ok(source.includes('from "@/components/admin/email/EmailHtmlPreview"'), file);
    assert.ok(source.includes("<EmailHtmlPreview "), file);
    assert.equal(source.includes("dangerouslySetInnerHTML"), false, file);
    assert.equal(source.includes("srcDoc="), false, file);
  }
});

test("no other admin page can reintroduce raw HTML injection or a separate email frame", () => {
  function walk(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) walk(file);
      else if (/\.tsx?$/.test(item.name)) {
        const source = fs.readFileSync(file, "utf8");
        assert.equal(source.includes("dangerouslySetInnerHTML"), false, file);
        if (source.includes("srcDoc=")) assert.ok(file.endsWith("/email/EmailHtmlPreview.tsx"), file);
      }
    }
  }
  walk(path.join(root, "src/app/(admin)"));
  walk(path.join(root, "src/components/admin"));
});

test("league composer and history keep zero-minimum columns and original SMS/content branches", () => {
  const source = fs.readFileSync(path.join(root, consumers[1]), "utf8");
  assert.ok(source.includes("xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"));
  assert.ok(source.includes("[&>*]:min-w-0"));
  assert.ok(source.includes("items-start"));
  assert.ok(source.includes("<LeagueCommunicationsComposer"));
  assert.ok(source.includes("message.textBody || message.body"));
  assert.ok(source.includes("message.providerStatus"));
});
