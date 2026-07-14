// ========================================
// File: src/lib/email/buildEmail.ts
// ========================================

import {
  SIXFL_EMAIL_SIGNATURE_TEXT,
  buildSIXFLFooterHtml,
} from "@/lib/email/footer";

const SIXFL_LOGO_URL = "https://www.sixfl.co.uk/sixfl-email.png";
const SIXFL_TV_LOGO_URL = "https://www.sixfl.co.uk/Sixfl-tv.png";

export const SIXFL_TV_EMAIL_BRAND_MARKER = "{{emailBrand:sixfl-tv}}";

const SIXFL_SIGNATURE_LINES = [
  "—",
  "SIXFL Admin",
  "League Operations",
  "hello@sixfl.co.uk",
  "www.sixfl.co.uk",
  "6-a-side football. Done properly.",
] as const;

const CTA_PLACEHOLDER = "{{cta}}";
const RESPONSE_BUTTONS_PATTERN =
  /(?:^|\n)\s*YES,\s*I still want to play:\s*(https?:\/\/\S+)\s*\n\s*NO,\s*remove me from the squad list:\s*(https?:\/\/\S+)\s*(?:\n|$)/i;
const POLL_BUTTONS_PATTERN = /(?:^|\n)\s*SIXFL_POLL_OPTIONS_START\s*\n([\s\S]*?)\n\s*SIXFL_POLL_OPTIONS_END\s*(?:\n|$)/i;
const EMAIL_BRAND_MARKER_PATTERN = /(?:^|\n)\s*(?:\{\{\s*emailBrand\s*:\s*sixfl-tv\s*\}\}|SIXFL_EMAIL_BRAND\s*:\s*sixfl-tv)\s*(?:\n|$)/gi;

export type SIXFLEmailCta = {
  label: string;
  url: string;
};

export type SIXFLEmailBranding = {
  teamName?: string | null;
  teamLogoUrl?: string | null;
  leagueName?: string | null;
};

export type SIXFLPaymentSummary = {
  amount?: string | null;
  reason?: string | null;
};

type EmailListLine = {
  depth: number;
  marker: string;
  text: string;
};

type PollButton = {
  label: string;
  url: string;
};

type EmailBrand = "sixfl" | "sixfl-tv";

type LogoDetails = {
  src: string;
  alt: string;
  width: number;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderInlineFormatting(value: string) {
  return escapeHtml(value)
    .replace(/\*{2,}([^*\n]+)\*{2,}/g, "<strong>$1</strong>")
    .replace(/\*{2,}/g, "");
}

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n/g, "\n");
}

function extractEmailBrand(body: string): { body: string; brand: EmailBrand } {
  let brand: EmailBrand = "sixfl";
  const normalised = normalizeLineEndings(body);

  const bodyWithoutMarkers = normalised
    .replace(EMAIL_BRAND_MARKER_PATTERN, (match) => {
      brand = "sixfl-tv";
      return match.startsWith("\n") ? "\n" : "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { body: bodyWithoutMarkers, brand };
}

function getLogoDetails(brand: EmailBrand): LogoDetails {
  if (brand === "sixfl-tv") {
    return {
      src: SIXFL_TV_LOGO_URL,
      alt: "SIXFL TV",
      width: 220,
    };
  }

  return {
    src: SIXFL_LOGO_URL,
    alt: "SIXFL",
    width: 180,
  };
}

function getListLine(value: string): EmailListLine | null {
  const match = value.match(/^(\s*)(-|\d+\.)\s+(.+)$/);
  if (!match) return null;

  const indentation = match[1].replace(/\t/g, "  ").length;
  const depth = Math.min(Math.floor(indentation / 2), 4);
  const marker = match[2];

  return {
    depth,
    marker: marker === "-" ? "•" : marker,
    text: match[3].trim(),
  };
}

function renderParagraphHtml(lines: string[]) {
  const text = lines.join("\n").trim();
  if (!text) return "";

  return `
    <p style="margin:0 0 18px 0;color:#111827;font-size:16px;line-height:1.65;mso-line-height-rule:exactly;">
      ${renderInlineFormatting(text).replace(/\n/g, "<br />")}
    </p>
  `.trim();
}

function renderListGroupHtml(items: EmailListLine[]) {
  if (!items.length) return "";

  return `
    <div style="margin:0 0 18px 0;color:#111827;font-size:16px;line-height:1.65;mso-line-height-rule:exactly;">
      ${items
        .map((item) => {
          const marginLeft = item.depth * 18;

          return `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="sixfl-list-row" style="width:100% !important;margin:0 0 8px ${marginLeft}px !important;border-collapse:collapse !important;table-layout:fixed !important;">
              <tr>
                <td valign="top" width="32" class="sixfl-list-marker" style="width:32px !important;min-width:32px !important;max-width:32px !important;padding:0 8px 0 0 !important;color:#111827;font-size:16px;line-height:1.65;mso-line-height-rule:exactly;">
                  ${escapeHtml(item.marker)}
                </td>
                <td valign="top" class="sixfl-list-text" style="padding:0 !important;color:#111827;font-size:16px;line-height:1.65;mso-line-height-rule:exactly;">
                  ${renderInlineFormatting(item.text)}
                </td>
              </tr>
            </table>
          `.trim();
        })
        .join("")}
    </div>
  `.trim();
}

function getSiteUrl() {
  const fallback = "https://www.sixfl.co.uk";
  const value =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    fallback;

  return value.replace(/\/+$/, "");
}

function resolveEmailAssetUrl(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;

  if (raw.startsWith("/")) {
    try {
      return new URL(raw, `${getSiteUrl()}/`).toString();
    } catch {
      return `${getSiteUrl()}${raw}`;
    }
  }

  return raw;
}

function stripTrailingSIXFLSignature(text: string) {
  let output = extractEmailBrand(text).body;

  const escapedLines = SIXFL_SIGNATURE_LINES.map((line) =>
    line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );

  const signaturePattern = new RegExp(
    `(?:\\n\\s*)?${escapedLines[0]}\\s*\\n\\s*${escapedLines[1]}\\s*\\n\\s*${escapedLines[2]}\\s*\\n\\s*${escapedLines[3]}\\s*\\n\\s*${escapedLines[4]}\\s*(?:\\n\\s*){1,2}${escapedLines[5]}\\s*$`,
    "i",
  );

  return output.replace(signaturePattern, "").trim();
}

function stripCtaPlaceholder(text: string) {
  return normalizeLineEndings(text)
    .replaceAll(CTA_PLACEHOLDER, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function convertTextToHtml(text: string) {
  return normalizeLineEndings(text)
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trimEnd())
    .filter((paragraph) => Boolean(paragraph.trim()))
    .map((paragraph) => {
      const lines = paragraph
        .split("\n")
        .map((line) => line.trimEnd())
        .filter((line) => Boolean(line.trim()));

      const chunks: string[] = [];
      let paragraphLines: string[] = [];
      let listItems: EmailListLine[] = [];

      function flushParagraph() {
        const html = renderParagraphHtml(paragraphLines);
        if (html) chunks.push(html);
        paragraphLines = [];
      }

      function flushList() {
        const html = renderListGroupHtml(listItems);
        if (html) chunks.push(html);
        listItems = [];
      }

      for (const line of lines) {
        const listLine = getListLine(line);
        if (listLine) {
          flushParagraph();
          listItems.push(listLine);
          continue;
        }

        flushList();
        paragraphLines.push(line.trim());
      }

      flushParagraph();
      flushList();
      return chunks.join("");
    })
    .join("");
}

function buildCtaHtml(cta?: SIXFLEmailCta) {
  const safeCta =
    cta?.label?.trim() && cta?.url?.trim()
      ? {
          label: cta.label.trim(),
          url: cta.url.trim(),
        }
      : undefined;

  if (!safeCta) return "";

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0 0;border-collapse:separate;">
      <tr>
        <td bgcolor="#1E5A43" style="border-radius:12px;background:#1E5A43;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.15);">
          <a href="${escapeHtml(safeCta.url)}" target="_blank" style="display:inline-block;background:#1E5A43;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:12px;font-weight:700;font-size:15px;line-height:1.1;letter-spacing:0.01em;mso-padding-alt:0;">
            ${escapeHtml(safeCta.label)}
          </a>
        </td>
      </tr>
    </table>
  `.trim();
}

function buildPlayerResponseButtonsHtml(input: { yesUrl: string; noUrl: string }) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 0 0;border-collapse:separate;">
      <tr>
        <td bgcolor="#1E5A43" style="border-radius:12px;background:#1E5A43;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.15);">
          <a href="${escapeHtml(input.yesUrl)}" target="_blank" style="display:inline-block;background:#1E5A43;color:#ffffff;text-decoration:none;padding:14px 20px;border-radius:12px;font-weight:700;font-size:15px;line-height:1.1;letter-spacing:0.01em;mso-padding-alt:0;">
            YES, I still want to play
          </a>
        </td>
        <td width="12" style="width:12px;font-size:1px;line-height:1px;">&nbsp;</td>
        <td bgcolor="#7f1d1d" style="border-radius:12px;background:#7f1d1d;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.10);">
          <a href="${escapeHtml(input.noUrl)}" target="_blank" style="display:inline-block;background:#7f1d1d;color:#ffffff;text-decoration:none;padding:14px 20px;border-radius:12px;font-weight:700;font-size:15px;line-height:1.1;letter-spacing:0.01em;mso-padding-alt:0;">
            NO, remove me
          </a>
        </td>
      </tr>
    </table>
  `.trim();
}

function extractPlayerResponseButtons(body: string) {
  const match = body.match(RESPONSE_BUTTONS_PATTERN);
  if (!match?.[1] || !match?.[2]) {
    return { body, buttonsHtml: "" };
  }

  return {
    body: body.replace(RESPONSE_BUTTONS_PATTERN, "\n").replace(/\n{3,}/g, "\n\n").trim(),
    buttonsHtml: buildPlayerResponseButtonsHtml({ yesUrl: match[1], noUrl: match[2] }),
  };
}

function parsePollButtons(rawBlock: string): PollButton[] {
  return rawBlock
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const match = line.match(/^(.+?):\s*(https?:\/\/\S+)$/i);
      if (!match?.[1] || !match?.[2]) return [];
      return [{ label: match[1].trim(), url: match[2].trim() }];
    });
}

function buildPollButtonsHtml(buttons: PollButton[]) {
  if (buttons.length === 0) return "";

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:12px 0 0 0;border-collapse:separate;">
      ${buttons
        .map(
          (button) => `
            <tr>
              <td bgcolor="#1E5A43" style="border-radius:12px;background:#1E5A43;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.12);">
                <a href="${escapeHtml(button.url)}" target="_blank" style="display:block;background:#1E5A43;color:#ffffff;text-decoration:none;padding:14px 18px;border-radius:12px;font-weight:700;font-size:15px;line-height:1.2;letter-spacing:0.01em;mso-padding-alt:0;">
                  ${escapeHtml(button.label)}
                </a>
              </td>
            </tr>
            <tr><td height="10" style="height:10px;font-size:1px;line-height:1px;">&nbsp;</td></tr>
          `.trim(),
        )
        .join("")}
    </table>
  `.trim();
}

function extractPollButtons(body: string) {
  const match = body.match(POLL_BUTTONS_PATTERN);
  if (!match?.[1]) {
    return { body, buttonsHtml: "" };
  }

  const buttons = parsePollButtons(match[1]);
  return {
    body: body.replace(POLL_BUTTONS_PATTERN, "\n").replace(/\n{3,}/g, "\n\n").trim(),
    buttonsHtml: buildPollButtonsHtml(buttons),
  };
}

function buildBrandingBlockHtml(branding?: SIXFLEmailBranding) {
  const teamName = branding?.teamName?.trim();
  const teamLogoUrl = resolveEmailAssetUrl(branding?.teamLogoUrl);
  const leagueName = branding?.leagueName?.trim();

  if (!teamName && !teamLogoUrl && !leagueName) return "";

  return `
    <div style="margin:0 0 24px 0;padding:16px 18px;border:1px solid #e5e7eb;border-radius:16px;background:#f9fafb;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
        <tr>
          ${teamLogoUrl ? `<td width="60" valign="middle" style="padding-right:14px;"><img src="${escapeHtml(teamLogoUrl)}" alt="${escapeHtml(teamName || "Team logo")}" width="48" height="48" style="display:block;width:48px;height:48px;object-fit:contain;border:0;outline:none;text-decoration:none;" /></td>` : ""}
          <td valign="middle">
            ${teamName ? `<div style="color:#111827;font-size:16px;font-weight:700;line-height:1.3;">${escapeHtml(teamName)}</div>` : ""}
            ${leagueName ? `<div style="margin-top:4px;color:#6b7280;font-size:13px;line-height:1.4;">${escapeHtml(leagueName)}</div>` : ""}
          </td>
        </tr>
      </table>
    </div>
  `.trim();
}

function buildPaymentSummaryHtml(payment?: SIXFLPaymentSummary) {
  const amount = payment?.amount?.trim();
  const reason = payment?.reason?.trim();
  if (!amount && !reason) return "";

  return `
    <div style="margin:0 0 24px 0;padding:16px 18px;border:1px solid #d1fae5;border-radius:16px;background:#ecfdf5;">
      <div style="margin:0 0 10px 0;color:#065f46;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Payment request</div>
      ${amount ? `<div style="margin:0 0 8px 0;color:#111827;font-size:14px;line-height:1.6;"><strong>Amount:</strong> ${escapeHtml(amount)}</div>` : ""}
      ${reason ? `<div style="margin:0;color:#111827;font-size:14px;line-height:1.6;"><strong>Reason:</strong> ${escapeHtml(reason)}</div>` : ""}
    </div>
  `.trim();
}

function buildBodyHtmlWithOptionalCta(body: string, cta?: SIXFLEmailCta) {
  const cleanedBody = stripTrailingSIXFLSignature(body);
  const responseButtons = extractPlayerResponseButtons(cleanedBody);
  const pollButtons = extractPollButtons(responseButtons.body);
  const ctaHtml = buildCtaHtml(cta);
  const bodyWithoutResponseButtons = pollButtons.body;
  const extraButtonsHtml = [pollButtons.buttonsHtml, responseButtons.buttonsHtml]
    .filter(Boolean)
    .map((html) => `<div style="margin:24px 0 28px 0;">${html}</div>`)
    .join("");

  if (!ctaHtml) {
    const bodyHtml = convertTextToHtml(stripCtaPlaceholder(bodyWithoutResponseButtons));
    return `${bodyHtml}${extraButtonsHtml}`;
  }

  if (bodyWithoutResponseButtons.includes(CTA_PLACEHOLDER)) {
    const parts = bodyWithoutResponseButtons.split(CTA_PLACEHOLDER);
    const html = parts
      .map((part, index) => {
        const trimmedPart = part.trim();
        const partHtml = trimmedPart ? convertTextToHtml(trimmedPart) : "";
        const shouldInsertCta = index < parts.length - 1;
        return `${partHtml}${shouldInsertCta ? `<div style="margin:24px 0 28px 0;">${ctaHtml}</div>` : ""}`;
      })
      .join("");
    return `${html}${extraButtonsHtml}`;
  }

  const bodyHtml = convertTextToHtml(bodyWithoutResponseButtons);
  return `${bodyHtml}<div style="margin:28px 0 8px 0;">${ctaHtml}</div>${extraButtonsHtml}`.trim();
}

function buildResponsiveEmailDocument(contentHtml: string, brand: EmailBrand) {
  const outerBackground = brand === "sixfl-tv" ? "#050505" : "#f3f4f6";

  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta http-equiv="x-ua-compatible" content="ie=edge" />
    <title>SIXFL</title>
    <style>
      html, body { margin: 0 !important; padding: 0 !important; width: 100% !important; height: 100% !important; }
      * { -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; }
      table, td { mso-table-lspace: 0pt !important; mso-table-rspace: 0pt !important; }
      table { border-spacing: 0 !important; border-collapse: collapse !important; table-layout: fixed !important; margin: 0 auto !important; }
      .sixfl-list-row { margin-right: 0 !important; margin-left: 0 !important; table-layout: fixed !important; }
      .sixfl-list-marker { width: 32px !important; min-width: 32px !important; max-width: 32px !important; }
      .sixfl-list-text { width: auto !important; }
      img { -ms-interpolation-mode: bicubic; }
      a { text-decoration: none; }
      @media screen and (max-width: 680px) {
        .sixfl-email-outer { padding: 14px 10px !important; }
        .sixfl-email-container { width: 100% !important; max-width: 100% !important; border-radius: 16px !important; }
        .sixfl-email-logo-cell { padding: 24px 22px 18px 22px !important; }
        .sixfl-email-content-cell { padding: 0 22px 26px 22px !important; }
        .sixfl-email-footer-cell { padding: 0 22px 26px 22px !important; }
        .sixfl-email-logo { width: 150px !important; max-width: 150px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:${outerBackground};word-spacing:normal;">
    <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">SIXFL message</div>
    ${contentHtml}
  </body>
</html>`;
}

export function appendSIXFLTextSignature(body: string) {
  const trimmedBody = stripTrailingSIXFLSignature(body);
  if (!trimmedBody) return SIXFL_EMAIL_SIGNATURE_TEXT;
  return `${trimmedBody}\n\n${SIXFL_EMAIL_SIGNATURE_TEXT}`.trim();
}

export function buildSIXFLEmailHtml(input: {
  body: string;
  cta?: SIXFLEmailCta;
  branding?: SIXFLEmailBranding;
  payment?: SIXFLPaymentSummary;
}) {
  const brandResult = extractEmailBrand(input.body);
  const logo = getLogoDetails(brandResult.brand);
  const bodyHtml = buildBodyHtmlWithOptionalCta(brandResult.body, input.cta);
  const brandingHtml = buildBrandingBlockHtml(input.branding);
  const paymentHtml = buildPaymentSummaryHtml(input.payment);
  const showPaymentProviderNote = Boolean(input.payment);
  const isSixflTv = brandResult.brand === "sixfl-tv";
  const outerBackground = isSixflTv ? "#050505" : "#f3f4f6";
  const containerBorder = isSixflTv ? "#111827" : "#e5e7eb";
  const logoBackground = isSixflTv ? "#050505" : "#ffffff";
  const logoPadding = isSixflTv ? "30px 32px 28px 32px" : "34px 32px 20px 32px";

  const contentHtml = `
    <center role="article" aria-roledescription="email" lang="en" style="width:100%;background:${outerBackground};">
      <div class="sixfl-email-outer" style="background:${outerBackground};padding:28px 12px;width:100%;box-sizing:border-box;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="sixfl-email-container" style="width:100%;max-width:640px;margin:0 auto;background:#ffffff;border:1px solid ${containerBorder};border-radius:18px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
          <tr>
            <td class="sixfl-email-logo-cell" bgcolor="${logoBackground}" style="padding:${logoPadding};background:${logoBackground};">
              <img src="${logo.src}" alt="${logo.alt}" width="${logo.width}" class="sixfl-email-logo" style="display:block;width:${logo.width}px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;" />
            </td>
          </tr>
          <tr>
            <td class="sixfl-email-content-cell" style="padding:30px 32px 30px 32px;">
              ${brandingHtml}
              ${paymentHtml}
              ${bodyHtml}
              ${showPaymentProviderNote ? `<div style="margin-top:12px;color:#6b7280;font-size:12px;line-height:1.6;">Secure payment powered by Stripe.</div>` : ""}
            </td>
          </tr>
          <tr>
            <td class="sixfl-email-footer-cell" style="padding:0 32px 32px 32px;">
              ${buildSIXFLFooterHtml()}
            </td>
          </tr>
        </table>
      </div>
    </center>
  `.trim();

  return buildResponsiveEmailDocument(contentHtml, brandResult.brand);
}
