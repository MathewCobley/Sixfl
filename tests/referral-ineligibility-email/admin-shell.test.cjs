const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// This regression happened AFTER render: a global email helper rewrote the
// entire referral list to 720px. Page-only/static layout tests cannot catch it.
test('production source and preparation never mount or restore legacy email layout mutation', () => {
  const retired = /QueuedSmsReasonHints|AdminEmailPreviewLayoutBridge|messageEmailPreviewFixed|emailPreviewFixed/;
  for (const root of ['src', 'scripts']) {
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (/\.(?:[cm]?js|tsx?|css)$/.test(entry.name)) {
          assert.doesNotMatch(fs.readFileSync(file, 'utf8'), retired, file);
        }
      }
    }
    walk(root);
  }
});

test('email previews retain their owned responsive sandbox rather than a parent-page resize script', () => {
  const source = fs.readFileSync('src/components/admin/email/EmailHtmlPreview.tsx', 'utf8');
  assert.match(source, /<iframe/);
  assert.match(source, /block w-full min-w-0/);
  assert.match(source, /sandbox="allow-popups allow-popups-to-escape-sandbox"/);
  assert.doesNotMatch(source, /MutationObserver|querySelector|\.style\./);
});
