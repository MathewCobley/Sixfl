type EmailHtmlPreviewProps = {
  html: string;
  title?: string;
  expanded?: boolean;
};

/**
 * Email HTML is a separate document, not application markup. In particular,
 * email-wide body/table rules must never enter the admin document's cascade.
 * This works for both stored complete emails and template-preview fragments.
 * The original message is not changed; this envelope is for viewing only.
 */
export function buildEmailPreviewDocument(html: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src https: data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<style>html { color-scheme: light; } body { margin: 0; padding: 0; background: #fff; color: #111827; font-family: Arial, Helvetica, sans-serif; overflow-wrap: anywhere; } img { max-width: 100%; } </style>
</head>
<body>${html}</body>
</html>`;
}

export default function EmailHtmlPreview({
  html,
  title = "Email preview",
  expanded = false,
}: EmailHtmlPreviewProps) {
  return (
    <iframe
      title={title}
      srcDoc={buildEmailPreviewDocument(html)}
      sandbox=""
      referrerPolicy="no-referrer"
      loading="lazy"
      className="block w-full min-w-0 border-0 bg-white"
      style={{
        height: expanded ? "48rem" : "28rem",
        maxHeight: "75vh",
        minHeight: "16rem",
      }}
    />
  );
}
