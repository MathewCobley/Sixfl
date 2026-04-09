// src/lib/email/footer.ts

export const SIXFL_EMAIL_SIGNATURE_TEXT = `
—
SIXFL Admin
League Operations
hello@sixfl.co.uk
www.sixfl.co.uk

6-a-side football. Done properly.
`.trim();

export function buildSIXFLFooterHtml() {
  return `
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
  `.trim();
}