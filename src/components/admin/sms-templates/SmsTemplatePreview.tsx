// ========================================
// File: src/components/admin/sms-templates/SmsTemplatePreview.tsx
// ========================================

"use client";

import { useMemo } from "react";

type SmsTemplateAudience = "LEAD" | "TEAM" | "PLAYER";
type SmsCtaUrlKeyValue = "" | "signupUrl" | "manageTeamUrl" | "teamJoinUrl";

export type SmsTemplatePreviewProps = {
  body: string;
  audience: SmsTemplateAudience;
  ctaUrlKey?: SmsCtaUrlKeyValue;
};

function getPreviewLink(ctaUrlKey: SmsCtaUrlKeyValue | undefined) {
  if (ctaUrlKey === "signupUrl") {
    return "https://www.sixfl.co.uk/register-interest?type=player";
  }

  if (ctaUrlKey === "manageTeamUrl") {
    return "https://www.sixfl.co.uk/claim?code=H862NY";
  }

  if (ctaUrlKey === "teamJoinUrl") {
    return "https://www.sixfl.co.uk/teams/join/rossett-managed-team";
  }

  return "";
}

function getAudienceLabel(audience: SmsTemplateAudience) {
  if (audience === "LEAD") {
    return "Lead";
  }

  if (audience === "PLAYER") {
    return "Player";
  }

  return "Team";
}

function previewReplace(
  text: string,
  audience: SmsTemplateAudience,
  ctaUrlKey?: SmsCtaUrlKeyValue,
) {
  const previewLink = getPreviewLink(ctaUrlKey);

  let replaced = text
    .replaceAll("{{firstName}}", "Jordan")
    .replaceAll("{{fullName}}", "Jordan Smith")
    .replaceAll("{{teamName}}", "Harrogate Athletic")
    .replaceAll("{{area}}", "Harrogate")
    .replaceAll("{{link}}", previewLink);

  if (audience === "TEAM") {
    replaced = replaced
      .replaceAll("{{captainName}}", "Jordan Smith")
      .replaceAll("{{leagueName}}", "Rossett Mens Tuesday");
  } else if (audience === "PLAYER") {
    replaced = replaced.replaceAll("{{leagueName}}", "Rossett Mens Tuesday");
  }

  if (previewLink && !text.includes("{{link}}")) {
    return `${replaced}${replaced ? "\n\n" : ""}${previewLink}`;
  }

  return replaced;
}

function estimateSegments(text: string) {
  const length = text.length;

  if (length === 0) {
    return 0;
  }

  if (length <= 160) {
    return 1;
  }

  return Math.ceil(length / 153);
}

export default function SmsTemplatePreview({
  body,
  audience,
  ctaUrlKey = "",
}: SmsTemplatePreviewProps) {
  const previewBody = useMemo(
    () => previewReplace(body, audience, ctaUrlKey),
    [body, audience, ctaUrlKey],
  );
  const length = previewBody.length;
  const segments = estimateSegments(previewBody);
  const previewLink = getPreviewLink(ctaUrlKey);

  return (
    <aside className="rounded-3xl border border-emerald-500/20 bg-[#04120d] p-6 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]">
      <div className="mb-5">
        <div className="text-sm font-medium text-white/70">Live preview</div>
        <p className="mt-2 text-sm leading-6 text-neutral-400">
          Preview uses sample SIXFL values and shows estimated SMS size.
        </p>
      </div>

      <div className="rounded-[28px] border border-white/10 bg-neutral-950/90 p-5 shadow-[0_12px_50px_rgba(0,0,0,0.18)]">
        <div className="mx-auto max-w-[340px] rounded-[26px] border border-white/10 bg-black/40 p-4">
          <div className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.24em] text-white/35">
            SMS preview
          </div>

          <div className="rounded-[22px] bg-emerald-500/15 px-4 py-3 text-sm leading-6 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] whitespace-pre-wrap">
            {previewBody || "Your SMS preview will appear here."}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-white/40">
                Audience
              </div>
              <div className="mt-1 text-sm font-semibold text-white">
                {getAudienceLabel(audience)}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-white/40">
                Characters
              </div>
              <div className="mt-1 text-sm font-semibold text-white">{length}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-white/40">
                Segments
              </div>
              <div className="mt-1 text-sm font-semibold text-white">{segments}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
        <div className="text-sm font-medium text-white/70">Suggested tokens</div>
        <div className="mt-3 space-y-2 text-sm leading-6 text-neutral-300">
          {audience === "LEAD" ? (
            <>
              <div>{"{{firstName}} • {{fullName}} • {{teamName}} • {{area}} • {{link}}"}</div>
              <div>Ideal for campaign follow-up and launch reminders.</div>
            </>
          ) : audience === "PLAYER" ? (
            <>
              <div>{"{{firstName}} • {{fullName}} • {{teamName}} • {{leagueName}} • {{area}} • {{link}}"}</div>
              <div>Ideal for player signup chases, prospect follow-up, and managed team recruitment.</div>
            </>
          ) : (
            <>
              <div>{"{{teamName}} • {{captainName}} • {{leagueName}} • {{area}} • {{link}}"}</div>
              <div>Ideal for team updates, payment nudges, and managed team join links.</div>
            </>
          )}
          {previewLink ? (
            <div className="break-all text-emerald-300">Preview link: {previewLink}</div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
