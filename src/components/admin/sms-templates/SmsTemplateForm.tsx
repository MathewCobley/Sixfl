// ========================================
// File: src/components/admin/sms-templates/SmsTemplateForm.tsx
// ========================================

"use client";

import { useEffect, useMemo, useState } from "react";
import { useTemplateSave, TemplateSaveControls } from "@/components/admin/templates/useTemplateSave";
import SmsTemplatePreview from "./SmsTemplatePreview";


type SmsTemplateAudience = "LEAD" | "TEAM" | "PLAYER" | "GENERAL" | "REFEREE";
type SmsCtaUrlKeyValue =
  | ""
  | "signupUrl"
  | "manageTeamUrl"
  | "teamJoinUrl"
  | "captainDashboardUrl"
  | "fixtureUrl"
  | "fixturesUrl";

type SmsTemplateFormValues = {
  id?: string;
  key: string;
  name: string;
  description: string;
  audience: SmsTemplateAudience;
  body: string;
  ctaUrlKey: SmsCtaUrlKeyValue;
  isActive: boolean;
};

type SmsTemplateFormProps = {
  mode: "create" | "edit";
  templateType: "campaign" | "system";
  initialValues?: Partial<SmsTemplateFormValues>;
};


const AUDIENCE_OPTIONS: Array<{
  value: SmsTemplateAudience;
  label: string;
  description: string;
}> = [
  {
    value: "LEAD",
    label: "Lead",
    description: "Lead campaigns, follow-up, and launch outreach.",
  },
  {
    value: "PLAYER",
    label: "Player",
    description: "Player prospect follow-up, signup nudges, and managed team recruitment.",
  },
  {
    value: "TEAM",
    label: "Team",
    description: "Team communication, captain updates, and operational texts.",
  },
  {
    value: "GENERAL",
    label: "General",
    description: "Reusable operational messaging not limited to one group.",
  },
  {
    value: "REFEREE",
    label: "Referee",
    description: "Referee operational texts and assignment updates.",
  },
];

const CTA_OPTIONS: Array<{
  value: SmsCtaUrlKeyValue;
  label: string;
  description: string;
  previewUrl?: string;
}> = [
  {
    value: "",
    label: "No link",
    description: "Keep this SMS body-only.",
  },
  {
    value: "teamJoinUrl",
    label: "Managed team join link",
    description: "Public team join page for managed teams and player signup.",
    previewUrl: "https://www.sixfl.co.uk/teams/join/rossett-managed-team",
  },
  {
    value: "signupUrl",
    label: "Register interest link",
    description: "General SIXFL player registration and interest flow.",
    previewUrl: "https://www.sixfl.co.uk/register-interest?type=player",
  },
  {
    value: "manageTeamUrl",
    label: "Manage team link",
    description: "Team claim or team access flow for captains.",
    previewUrl: "https://www.sixfl.co.uk/claim?code=H862NY",
  },
  {
    value: "captainDashboardUrl",
    label: "Captain dashboard link",
    description: "Captain access link for fixture and team actions.",
    previewUrl: "https://www.sixfl.co.uk/captain/team/example",
  },
  {
    value: "fixtureUrl",
    label: "Fixture link",
    description: "Direct link to a specific fixture.",
    previewUrl: "https://www.sixfl.co.uk/fixtures/example",
  },
  {
    value: "fixturesUrl",
    label: "Fixtures list link",
    description: "Link to the fixtures list for the current team or league.",
    previewUrl: "https://www.sixfl.co.uk/captain/team/example/fixtures",
  },
];

const LEAD_TOKENS = [
  "{{firstName}}",
  "{{fullName}}",
  "{{teamName}}",
  "{{area}}",
  "{{link}}",
] as const;
const PLAYER_TOKENS = [
  "{{firstName}}",
  "{{fullName}}",
  "{{teamName}}",
  "{{leagueName}}",
  "{{area}}",
  "{{link}}",
] as const;
const TEAM_TOKENS = [
  "{{teamName}}",
  "{{captainName}}",
  "{{leagueName}}",
  "{{area}}",
  "{{link}}",
] as const;
const GENERAL_TOKENS = [
  "{{teamName}}",
  "{{leagueName}}",
  "{{area}}",
  "{{link}}",
] as const;
const REFEREE_TOKENS = [
  "{{fullName}}",
  "{{leagueName}}",
  "{{fixtureUrl}}",
  "{{link}}",
] as const;

function slugifyTemplateKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

export default function SmsTemplateForm({
  mode,
  templateType,
  initialValues,
}: SmsTemplateFormProps) {
  const save = useTemplateSave({ mode, templateType, channel: "SMS" });
  const { state } = save;
  const [key, setKey] = useState(initialValues?.key ?? "");
  const [name, setName] = useState(initialValues?.name ?? "");
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [audience, setAudience] = useState<SmsTemplateAudience>(
    initialValues?.audience ?? "LEAD",
  );
  const [body, setBody] = useState(initialValues?.body ?? "");
  const [ctaUrlKey, setCtaUrlKey] = useState<SmsCtaUrlKeyValue>(
    initialValues?.ctaUrlKey ?? "",
  );
  const [isActive, setIsActive] = useState(initialValues?.isActive ?? true);

  useEffect(() => {
    if (mode === "create" && !key.trim() && name.trim()) {
      setKey(slugifyTemplateKey(name));
    }
  }, [mode, name, key]);

  const availableTokens = useMemo(() => {
    if (audience === "LEAD") {
      return LEAD_TOKENS;
    }

    if (audience === "PLAYER") {
      return PLAYER_TOKENS;
    }

    if (audience === "REFEREE") {
      return REFEREE_TOKENS;
    }

    if (audience === "GENERAL") {
      return GENERAL_TOKENS;
    }

    return TEAM_TOKENS;
  }, [audience]);

  const selectedCtaOption = useMemo(
    () =>
      CTA_OPTIONS.find((option) => option.value === ctaUrlKey) ?? CTA_OPTIONS[0],
    [ctaUrlKey],
  );

  const bodyLength = body.length;
  const bodySegments = estimateSegments(body);

  const keyError = state?.errors?.key?.[0];
  const nameError = state?.errors?.name?.[0];
  const audienceError = state?.errors?.audience?.[0];
  const bodyError = state?.errors?.body?.[0];
  const ctaUrlKeyError = state?.errors?.ctaUrlKey?.[0];

  function insertToken(token: string) {
    setBody((current) => {
      if (!current) {
        return token;
      }

      const spacer = current.endsWith(" ") || current.endsWith("\n") ? "" : " ";
      return `${current}${spacer}${token}`;
    });
  }

  return (
    <form onSubmit={save.onSubmit} className="space-y-8">
      {initialValues?.id ? <input type="hidden" name="id" value={initialValues.id} /> : null}

      <input type="hidden" name="audience" value={audience} />
      <input type="hidden" name="ctaUrlKey" value={ctaUrlKey} />
      <input type="hidden" name="isActive" value={String(isActive)} />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="space-y-8">
          <fieldset disabled={save.pending || Boolean(save.savedUrl) || Boolean(state.needsCheck)} className="min-w-0 space-y-8">
          <section className="rounded-3xl border border-white/10 bg-neutral-950/90 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-white">Template details</h2>
              <p className="mt-1 text-sm text-neutral-400">
                Keep SMS templates short, clear, and reusable.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium text-white">
                  Template name
                </label>
                <input id="name" name="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Player signup chase" className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition placeholder:text-neutral-500 focus:border-emerald-400/50 focus:bg-white/[0.05]" />
                {nameError ? <p className="text-sm text-red-400">{nameError}</p> : null}
              </div>

              <div className="space-y-2">
                <label htmlFor="key" className="text-sm font-medium text-white">
                  Template key
                </label>
                <input id="key" name="key" value={key} onChange={(event) => setKey(slugifyTemplateKey(event.target.value))} placeholder="player-signup-chase" className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition placeholder:text-neutral-500 focus:border-emerald-400/50 focus:bg-white/[0.05]" />
                {keyError ? <p className="text-sm text-red-400">{keyError}</p> : null}
              </div>

              <div className="space-y-2 md:col-span-2">
                <label htmlFor="description" className="text-sm font-medium text-white">
                  Description
                </label>
                <textarea id="description" name="description" value={description} onChange={(event) => setDescription(event.target.value)} rows={4} placeholder="Explain when this SMS should be used." className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition placeholder:text-neutral-500 focus:border-emerald-400/50 focus:bg-white/[0.05]" />
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-neutral-950/90 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-white">Audience</h2>
              <p className="mt-1 text-sm text-neutral-400">Choose the audience this SMS template is for.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
              {AUDIENCE_OPTIONS.map((option) => {
                const selected = audience === option.value;
                return (
                  <button key={option.value} type="button" onClick={() => setAudience(option.value)} className={[
                    "min-h-[138px] rounded-2xl border px-4 py-4 text-left transition",
                    selected ? "border-emerald-400/50 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(16,185,129,0.12)]" : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]",
                  ].join(" ")}>
                    <div className="text-sm font-semibold text-white">{option.label}</div>
                    <div className="mt-2 text-sm leading-6 text-neutral-400">{option.description}</div>
                  </button>
                );
              })}
            </div>

            {audienceError ? <p className="mt-3 text-sm text-red-400">{audienceError}</p> : null}
          </section>

          <section className="rounded-3xl border border-white/10 bg-neutral-950/90 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-white">SMS content</h2>
              <p className="mt-1 text-sm text-neutral-400">Write the actual text message. Keep it concise and easy to scan.</p>
            </div>

            <div className="space-y-5">
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Quick insert</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {availableTokens.map((token) => (
                    <button key={token} type="button" onClick={() => insertToken(token)} className="rounded-full border border-emerald-500/25 bg-black/30 px-3 py-1.5 text-sm text-emerald-300 transition hover:border-emerald-400/40 hover:bg-emerald-500/10">
                      {token}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-sm leading-6 text-neutral-300">
                  Use <span className="text-white">{'{{link}}'}</span> where you want the selected link to appear. If you leave it out, the link will be appended at the end of the SMS preview.
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="body" className="text-sm font-medium text-white">SMS body</label>
                <textarea id="body" name="body" value={body} onChange={(event) => setBody(event.target.value)} rows={12} placeholder="Write the SMS body here..." className="min-h-[320px] w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-white outline-none transition placeholder:text-neutral-500 focus:border-emerald-400/50 focus:bg-white/[0.05]" />
                {bodyError ? <p className="text-sm text-red-400">{bodyError}</p> : null}
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-neutral-950/90 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-white">SMS link</h2>
              <p className="mt-1 text-sm text-neutral-400">SMS uses a plain text link, not a button. Choose the destination you want to include.</p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {CTA_OPTIONS.map((option) => {
                const selected = ctaUrlKey === option.value;
                return (
                  <button key={option.value || "none"} type="button" onClick={() => setCtaUrlKey(option.value)} className={[
                    "rounded-2xl border px-4 py-4 text-left transition",
                    selected ? "border-emerald-400/50 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(16,185,129,0.12)]" : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]",
                  ].join(" ")}>
                    <div className="text-sm font-semibold text-white">{option.label}</div>
                    <div className="mt-1 text-xs leading-5 text-neutral-400">{option.description}</div>
                    {option.previewUrl ? <div className="mt-3 break-all text-xs text-emerald-300/90">{option.previewUrl}</div> : null}
                  </button>
                );
              })}
            </div>
            {ctaUrlKeyError ? <p className="mt-3 text-sm text-red-400">{ctaUrlKeyError}</p> : null}

            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-neutral-300">
              <div className="font-medium text-white">Selected link</div>
              <div className="mt-2">
                {selectedCtaOption.value ? `${selectedCtaOption.label}${selectedCtaOption.previewUrl ? ` · ${selectedCtaOption.previewUrl}` : ""}` : "No link selected"}
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-neutral-950/90 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Characters</div>
                <div className="mt-2 text-2xl font-semibold text-white">{bodyLength}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Segments</div>
                <div className="mt-2 text-2xl font-semibold text-white">{bodySegments}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Status</div>
                <div className="mt-2">
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                    <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} className="h-5 w-5 rounded border-white/20 bg-black text-emerald-500 focus:ring-emerald-500" />
                    <span className="text-sm font-medium text-white">Template is active</span>
                  </label>
                </div>
              </div>
            </div>
          </section>

          </fieldset>
          <TemplateSaveControls save={save} mode={mode} />
        </div>

        <SmsTemplatePreview
          body={body}
          audience={audience as never}
          ctaUrlKey={ctaUrlKey as never}
        />
      </div>
    </form>
  );
}
