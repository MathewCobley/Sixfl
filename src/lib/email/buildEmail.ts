// ========================================
// File: src/lib/email/buildEmail.ts
// ========================================

const SIXFL_LOGO_URL = "https://www.sixfl.co.uk/sixfl-email.png";

const SIXFL_EMAIL_SIGNATURE_TEXT = `
—
SIXFL Admin
League Operations
hello@sixfl.co.uk
www.sixfl.co.uk

6-a-side football. Done properly.
`.trim();

const SIXFL_SIGNATURE_LINES = [
  "—",
  "SIXFL Admin",
  "League Operations",
  "hello@sixfl.co.uk",
  "www.sixfl.co.uk",
  "6-a-side football. Done properly.",
] as const;

const CTA_PLACEHOLDER = "{{cta}}";

// ========================================
// Types
// ========================================

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

// ========================================
// Helpers
// ========================================

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n/g, "\n");
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

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

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
  let output = normalizeLineEndings(text).trim();

  const escapedLines = SIXFL_SIGNATURE_LINES.map((line) =>
    line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );

  const signaturePattern = new RegExp(
    `(?:\\n\\s*)?${escapedLines[0]}\\s*\\n\\s*${escapedLines[1]}\\s*\\n\\s*${escapedLines[2]}\\s*\\n\\s*${escapedLines[3]}\\s*\\n\\s*${escapedLines[4]}\\s*(?:\\n\\s*){1,2}${escapedLines[5]}\\s*$`,
    "i",
  );

  output = output.replace(signaturePattern, "").trim();

  return output;
}

function convertTextToHtml(text: string) {
  return normalizeLineEndings(text)
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      const lines = paragraph
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      const bulletLines = lines.filter((line) => line.startsWith("- "));
      const nonBulletLines = lines.filter((line) => !line.startsWith("- "));

      if (bulletLines.length > 0) {
        const normalHtml = nonBulletLines.length
          ? `
            <p style="margin:0 0 12px 0;color:#111827;font-size:15px;line-height:1.75;">
              ${escapeHtml(nonBulletLines.join("\n")).replace(/\n/g, "<br />")}
            </p>
          `.trim()
          : "";

        const listHtml = `
          <ul
            style="
              margin:0 0 18px 0;
              padding-left:20px;
              color:#111827;
              font-size:15px;
              line-height:1.75;
            "
          >
            ${bulletLines
              .map(
                (line) => `
                  <li style="margin:0 0 10px 0;">
                    ${escapeHtml(line.replace(/^- /, "").trim())}
                  </li>
                `.trim(),
              )
              .join("")}
          </ul>
        `.trim();

        return `${normalHtml}${listHtml}`;
      }

      const paragraphHtml = escapeHtml(paragraph).replace(/\n/g, "<br />");

      return `
        <p style="margin:0 0 18px 0;color:#111827;font-size:15px;line-height:1.75;">
          ${paragraphHtml}
        </p>
      `.trim();
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

  if (!safeCta) {
    return "";
  }

  return `
    <table
      role="presentation"
      cellpadding="0"
      cellspacing="0"
      border="0"
      style="margin:8px 0 0 0;"
    >
      <tr>
        <td
          style="
            border-radius:12px;
            background:#1E5A43;
            text-align:center;
            box-shadow:0 4px 12px rgba(0,0,0,0.15);
          "
        >
          <a
            href="${escapeHtml(safeCta.url)}"
            style="
              display:inline-block;
              background:#1E5A43;
              color:#ffffff;
              text-decoration:none;
              padding:14px 22px;
              border-radius:12px;
              font-weight:700;
              font-size:14px;
              line-height:1;
              letter-spacing:0.01em;
            "
          >
            ${escapeHtml(safeCta.label)}
          </a>
        </td>
      </tr>
    </table>
  `.trim();
}

function buildBrandingBlockHtml(branding?: SIXFLEmailBranding) {
  const teamName = branding?.teamName?.trim();
  const teamLogoUrl = resolveEmailAssetUrl(branding?.teamLogoUrl);
  const leagueName = branding?.leagueName?.trim();

  if (!teamName && !teamLogoUrl && !leagueName) {
    return "";
  }

  return `
    <div
      style="
        margin:0 0 24px 0;
        padding:16px 18px;
        border:1px solid #e5e7eb;
        border-radius:16px;
        background:#f9fafb;
      "
    >
      <table
        role="presentation"
        cellpadding="0"
        cellspacing="0"
        border="0"
        width="100%"
      >
        <tr>
          ${
            teamLogoUrl
              ? `
            <td width="60" valign="middle" style="padding-right:14px;">
              <img
                src="${escapeHtml(teamLogoUrl)}"
                alt="${escapeHtml(teamName || "Team logo")}"
                width="48"
                height="48"
                style="display:block;width:48px;height:48px;object-fit:contain;border:0;"
              />
            </td>
          `.trim()
              : ""
          }
          <td valign="middle">
            ${
              teamName
                ? `
              <div style="color:#111827;font-size:16px;font-weight:700;line-height:1.3;">
                ${escapeHtml(teamName)}
              </div>
            `.trim()
                : ""
            }
            ${
              leagueName
                ? `
              <div style="margin-top:4px;color:#6b7280;font-size:13px;line-height:1.4;">
                ${escapeHtml(leagueName)}
              </div>
            `.trim()
                : ""
            }
          </td>
        </tr>
      </table>
    </div>
  `.trim();
}

function buildPaymentSummaryHtml(payment?: SIXFLPaymentSummary) {
  const amount = payment?.amount?.trim();
  const reason = payment?.reason?.trim();

  if (!amount && !reason) {
    return "";
  }

  return `
    <div
      style="
        margin:0 0 24px 0;
        padding:16px 18px;
        border:1px solid #d1fae5;
        border-radius:16px;
        background:#ecfdf5;
      "
    >
      <div
        style="
          margin:0 0 10px 0;
          color:#065f46;
          font-size:12px;
          font-weight:700;
          letter-spacing:0.12em;
          text-transform:uppercase;
        "
      >
        Payment request
      </div>

      ${
        amount
          ? `
        <div style="margin:0 0 8px 0;color:#111827;font-size:14px;line-height:1.6;">
          <strong>Amount:</strong> ${escapeHtml(amount)}
        </div>
      `.trim()
          : ""
      }

      ${
        reason
          ? `
        <div style="margin:0;color:#111827;font-size:14px;line-height:1.6;">
          <strong>Reason:</strong> ${escapeHtml(reason)}
        </div>
      `.trim()
          : ""
      }
    </div>
  `.trim();
}

function buildBodyHtmlWithOptionalCta(body: string, cta?: SIXFLEmailCta) {
  const cleanedBody = stripTrailingSIXFLSignature(body);
  const ctaHtml = buildCtaHtml(cta);

  if (!ctaHtml) {
    return convertTextToHtml(cleanedBody);
  }

  if (cleanedBody.includes(CTA_PLACEHOLDER)) {
    const parts = cleanedBody.split(CTA_PLACEHOLDER);

    return parts
      .map((part, index) => {
        const trimmedPart = part.trim();
        const partHtml = trimmedPart ? convertTextToHtml(trimmedPart) : "";
        const shouldInsertCta = index < parts.length - 1;

        return `
          ${partHtml}
          ${
            shouldInsertCta
              ? `<div style="margin:24px 0 28px 0;">${ctaHtml}</div>`
              : ""
          }
        `.trim();
      })
      .join("");
  }

  const bodyHtml = convertTextToHtml(cleanedBody);

  return `
    ${bodyHtml}
    <div style="margin:28px 0 8px 0;">
      ${ctaHtml}
    </div>
  `.trim();
}

// ========================================
// Public API
// ========================================

export function appendSIXFLTextSignature(body: string) {
  const trimmedBody = stripTrailingSIXFLSignature(body);

  if (!trimmedBody) {
    return SIXFL_EMAIL_SIGNATURE_TEXT;
  }

  return `${trimmedBody}\n\n${SIXFL_EMAIL_SIGNATURE_TEXT}`.trim();
}

export function buildSIXFLEmailHtml(input: {
  body: string;
  cta?: SIXFLEmailCta;
  branding?: SIXFLEmailBranding;
  payment?: SIXFLPaymentSummary;
}) {
  const bodyHtml = buildBodyHtmlWithOptionalCta(input.body, input.cta);
  const brandingHtml = buildBrandingBlockHtml(input.branding);
  const paymentHtml = buildPaymentSummaryHtml(input.payment);
  const showPaymentProviderNote = Boolean(input.payment);

  return `
    <div style="background:#f3f4f6;padding:28px 12px;">
      <table
        role="presentation"
        cellpadding="0"
        cellspacing="0"
        border="0"
        width="100%"
        style="
          max-width:640px;
          margin:0 auto;
          background:#ffffff;
          border:1px solid #e5e7eb;
          border-radius:18px;
          overflow:hidden;
          font-family:Arial,sans-serif;
        "
      >
        <tr>
          <td style="padding:34px 32px 20px 32px;">
            <img
              src="${SIXFL_LOGO_URL}"
              alt="SIXFL"
              width="180"
              style="display:block;width:180px;max-width:100%;height:auto;border:0;"
            />
          </td>
        </tr>

        <tr>
          <td style="padding:0 32px 30px 32px;">
            ${brandingHtml}
            ${paymentHtml}
            ${bodyHtml}
            ${
              showPaymentProviderNote
                ? `
              <div style="margin-top:12px;color:#6b7280;font-size:12px;line-height:1.6;">
                Secure payment powered by Stripe.
              </div>
            `.trim()
                : ""
            }
          </td>
        </tr>

        <tr>
          <td style="padding:0 32px 32px 32px;">
            <table
              role="presentation"
              cellpadding="0"
              cellspacing="0"
              border="0"
              width="100%"
              style="border-top:1px solid #e5e7eb;"
            >
              <tr>
                <td style="padding-top:20px;color:#111827;font-size:14px;line-height:1.55;">
                  <div style="font-weight:700;">SIXFL Admin</div>
                  <div style="color:#4b5563;">League Operations</div>

                  <div style="padding-top:10px;">
                    <a
                      href="mailto:hello@sixfl.co.uk"
                      style="color:#1E5A43;text-decoration:none;"
                    >
                      hello@sixfl.co.uk
                    </a>
                  </div>

                  <div>
                    <a
                      href="https://www.sixfl.co.uk"
                      style="color:#1E5A43;text-decoration:none;"
                    >
                      www.sixfl.co.uk
                    </a>
                  </div>

                  <div style="padding-top:12px;color:#6b7280;font-size:13px;">
                    6-a-side football. Done properly.
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `.trim();
}
