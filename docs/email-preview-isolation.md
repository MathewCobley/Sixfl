# Admin HTML email previews

## Cause

The league communications history rendered complete stored emails directly into the application's DOM using `dangerouslySetInnerHTML`. The SIXFL email renderer includes document-wide rules for `html`, `body`, tables, images and links. Those rules belong to the email document, not the admin application. A stored message can therefore change the admin page's layout even when its history panel is collapsed. Other admin message-history and template-preview screens used the same unsafe presentation pattern.

## Shared source

`src/components/admin/email/EmailHtmlPreview.tsx` displays both full emails and HTML fragments using `srcDoc` in a separate sandboxed document. It retains the email's content and styling within a bounded, responsive, scrollable iframe. The preview envelope does not modify the stored message, sending template or queue.

The frame has no scripts, forms, same-origin access or top-navigation permission. Its CSP further restricts active content. Existing explicit new-tab preview-link behaviour is preserved; clicking a real action link remains a deliberate user action. HTTPS/data email images remain available with a no-referrer policy. No claim is made that preview images are an exact simulation of every email client.

Consumers: league communications; team history; lead history; player-prospect communications; team-player communications; team-prospect communications; central message threads; email-template editing; queue message previews. The queue's previous individual iframe uses the same shared component now. SMS/plain-text rendering, recipient selection, message status and sending actions are unchanged.

The league composer/history grid uses zero-minimum fractional columns, minimum-width-zero children and top alignment so a long message cannot force wider or equally tall sibling panels.

## Regression checks

`tests/email-preview-isolation.test.cjs` checks all nine native consumers and scans prepared admin source for unisolated HTML. It checks SSR escaping, sandbox permissions, responsive frame bounds and preservation of the actual SIXFL email document.

`tests/email-preview-isolation.browser.cjs` uses Chromium with all external requests intercepted. Its negative control inserts the real generated email directly into a local layout and detects changes to the parent body and table. The fixed component is then checked on desktop and mobile with document-wide CSS, oversized content and attempted scripts. The tests also check readable/scrolled email content, usable surrounding controls, safe new-tab links, and blocked forms and parent navigation.

The `Admin email preview isolation` workflow runs after the full production prebuild, alongside existing critical-feature and DOM-policy checks. The browser dependency is pinned and installed only in the CI temporary directory, not added to application dependencies.

Deployment status and an authenticated inspection of the particular league page must be reported separately from the synthetic browser and source checks. No actual customer email or SMS is sent by these tests.
