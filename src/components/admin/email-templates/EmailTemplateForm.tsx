// ========================================
// File: src/components/admin/email-templates/EmailTemplateForm.tsx
// ========================================

"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { buildSIXFLFooterHtml } from "@/lib/email/footer";

type FormState = {
  ok?: boolean;
  success?: boolean;
  message?: string;
  error?: string;
  errors?: Record<string, string[]>;
};

type TemplateAudience = "LEAD" | "TEAM" | "PLAYER" | "REFEREE" | "GENERAL";
type InterestTypeValue = "" | "TEAM" | "PLAYER" | "REFEREE";
type CtaUrlKeyValue =
  | ""
  | "signupUrl"
  | "manageTeamUrl"
  | "paymentUrl"
  | "captainDashboardUrl"
  | "teamJoinUrl"
  | "fixtureUrl"
  | "fixturesUrl";

type EmailTemplateFormValues = {
  id?: string;
  key: string;
  name: string;
  description: string;
  audience: TemplateAudience;
  interestType: InterestTypeValue;
  subject: string;
  body: string;
  ctaLabel: string;
  ctaUrlKey: CtaUrlKeyValue;
  isActive: boolean;
};

type EmailTemplateFormProps = {
  mode: "create" | "edit";
  action: (formData: FormData) => Promise<FormState>;
  initialValues?: Partial<EmailTemplateFormValues>;
};

type PreviewBlock = { type: "paragraph"; content: string } | { type: "cta" };

const INITIAL_STATE: FormState = {
  ok: false,
  success: false,
  message: "",
  error: "",
  errors: {},
};

const PREVIEW_CLAIM_CODE = "H862NY";
const PREVIEW_CLAIM_LINK = `https://www.sixfl.co.uk/claim?code=${PREVIEW_CLAIM_CODE}`;
const PREVIEW_FIXTURE_LINK = "https://www.sixfl.co.uk/leagues/rossett-mens-tuesday/fixtures/harrogate-athletic-vs-rossett-vets";
const PREVIEW_FIXTURES_LINK = "https://www.sixfl.co.uk/leagues/rossett-mens-tuesday/fixtures";
const PREVIEW_PAYMENT_LINK = "https://www.sixfl.co.uk/pay/charge/demo-token";

const AUDIENCE_OPTIONS: Array<{
  value: TemplateAudience;
  label: string;
  description: string;
}> = [
  { value: "LEAD", label: "Lead", description: "General lead nurture and enquiry follow-up." },
  { value: "TEAM", label: "Team", description: "Team-specific admin or captain communication." },
  { value: "PLAYER", label: "Player", description: "Player sign-up and player messaging." },
  { value: "REFEREE", label: "Referee", description: "Referee onboarding and operational emails." },
  { value: "GENERAL", label: "General", description: "Reusable template not tied to one audience." },
];

const INTEREST_TYPE_OPTIONS: Array<{ value: InterestTypeValue; label: string }> = [
  { value: "", label: "None" },
  { value: "TEAM", label: "Team" },
  { value: "PLAYER", label: "Player" },
  { value: "REFEREE", label: "Referee" },
];

const QUICK_INSERT_TOKENS = [
  "{{firstName}}",
  "{{fullName}}",
  "{{teamName}}",
  "{{leagueName}}",
  "{{leagueDisplayName}}",
  "{{fixtureName}}",
  "{{kickoffLabel}}",
  "{{fixturesList}}",
  "{{amount}}",
  "{{claimCode}}",
  "{{claimLink}}",
  "{{captainDashboardUrl}}",
  "{{fixtureUrl}}",
  "{{fixturesUrl}}",
  "{{paymentUrl}}",
  "{{area}}",
  "{{preferredNight}}",
  "{{cta}}",
] as const;

const CTA_OPTIONS: Array<{
  value: CtaUrlKeyValue;
  label: string;
  description: string;
  previewUrl?: string;
}> = [
  { value: "", label: "No button", description: "Use plain email copy only." },
  { value: "signupUrl", label: "Register interest", description: "Links to the SIXFL registration / interest page.", previewUrl: "https://www.sixfl.co.uk/register-interest" },
  { value: "manageTeamUrl", label: "Manage team", description: "Links to the team claim / management flow.", previewUrl: PREVIEW_CLAIM_LINK },
  { value: "captainDashboardUrl", label: "Captain dashboard sign-in", description: "Links captains into the claim and dashboard access flow for their team.", previewUrl: PREVIEW_CLAIM_LINK },
  { value: "teamJoinUrl", label: "Team join page", description: "Links players to the managed team public join page.", previewUrl: "https://www.sixfl.co.uk/teams/join/rossett-managed-team" },
  { value: "fixtureUrl", label: "Fixture page", description: "Links to a specific fixture page or detail view.", previewUrl: PREVIEW_FIXTURE_LINK },
  { value: "fixturesUrl", label: "Fixtures page", description: "Links to the public league fixtures page.", previewUrl: PREVIEW_FIXTURES_LINK },
  { value: "paymentUrl", label: "Payment link", description: "Use a payment link supplied when the email is sent.", previewUrl: PREVIEW_PAYMENT_LINK },
];

function SubmitButton({ mode }: { mode: "create" | "edit" }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending
        ? mode === "create"
          ? "Creating template..."
          : "Saving changes..."
        : mode === "create"
          ? "Create template"
          : "Save changes"}
    </button>
  );
}

function slugifyTemplateKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function previewReplace(text: string) {
  return text
    .replaceAll("{{firstName}}", "Jordan")
    .replaceAll("{{fullName}}", "Jordan Smith")
    .replaceAll("{{teamName}}", "Harrogate Athletic")
    .replaceAll("{{leagueName}}", "Rossett Mens Tuesday")
    .replaceAll("{{leagueDisplayName}}", "Rossett Mens Tuesday — Spring 2026")
    .replaceAll("{{fixtureName}}", "Harrogate Athletic vs Rossett Vets")
    .replaceAll("{{kickoffLabel}}", "Tue 21 Apr, 21:20")
    .replaceAll("{{fixturesList}}", "Tue 21 Apr, 21:20 — Harrogate Athletic vs Rossett Vets — Pitch 1\nTue 28 Apr, 20:40 — Rossett Vets vs Boroughbridge United — Pitch 2")
    .replaceAll("{{amount}}", "£30.00")
    .replaceAll("{{claimCode}}", PREVIEW_CLAIM_CODE)
    .replaceAll("{{claimLink}}", PREVIEW_CLAIM_LINK)
    .replaceAll("{{captainDashboardUrl}}", PREVIEW_CLAIM_LINK)
    .replaceAll("{{fixtureUrl}}", PREVIEW_FIXTURE_LINK)
    .replaceAll("{{fixturesUrl}}", PREVIEW_FIXTURES_LINK)
    .replaceAll("{{paymentUrl}}", PREVIEW_PAYMENT_LINK)
    .replaceAll("{{area}}", "Harrogate")
    .replaceAll("{{preferredNight}}", "Tuesday");
}

function buildPreviewBlocks(text: string, hasCta: boolean): PreviewBlock[] {
  const replaced = previewReplace(text);
  const segments = replaced.split("{{cta}}");
  const blocks: PreviewBlock[] = [];

  segments.forEach((segment, index) => {
    const paragraphs = segment
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean);

    paragraphs.forEach((paragraph) => {
      blocks.push({ type: "paragraph", content: paragraph });
    });

    if (index < segments.length - 1 && hasCta) {
      blocks.push({ type: "cta" });
    }
  });

  return blocks;
}

function countCtaPlaceholders(text: string) {
  return (text.match(/\{\{cta\}\}/g) ?? []).length;
}

export default function EmailTemplateForm({
  mode,
  action,
  initialValues,
}: EmailTemplateFormProps) {
  async function submitTemplateAction(
    _prevState: FormState,
    formData: FormData,
  ): Promise<FormState> {
    return action(formData);
  }

  const [state, formAction] = useActionState(submitTemplateAction, INITIAL_STATE);
  const [key, setKey] = useState(initialValues?.key ?? "");
  const [name, setName] = useState(initialValues?.name ?? "");
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [audience, setAudience] = useState<TemplateAudience>(initialValues?.audience ?? "LEAD");
  const [interestType, setInterestType] = useState<InterestTypeValue>(initialValues?.interestType ?? "");
  const [subject, setSubject] = useState(initialValues?.subject ?? "");
  const [body, setBody] = useState(initialValues?.body ?? "");
  const [ctaLabel, setCtaLabel] = useState(initialValues?.ctaLabel ?? "");
  const [ctaUrlKey, setCtaUrlKey] = useState<CtaUrlKeyValue>(initialValues?.ctaUrlKey ?? "");
  const [isActive, setIsActive] = useState(initialValues?.isActive ?? true);
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (mode === "create" && !key.trim() && name.trim()) {
      setKey(slugifyTemplateKey(name));
    }
  }, [mode, name, key]);

  const selectedCtaOption = useMemo(
    () => CTA_OPTIONS.find((option) => option.value === ctaUrlKey) ?? CTA_OPTIONS[0],
    [ctaUrlKey],
  );
  const hasSelectedCta = Boolean(ctaLabel.trim() && selectedCtaOption.value);
  const ctaPlaceholderCount = useMemo(() => countCtaPlaceholders(body), [body]);
  const previewBlocks = useMemo(() => {
    const blocks = buildPreviewBlocks(body, hasSelectedCta);
    if (hasSelectedCta && ctaPlaceholderCount === 0) {
      blocks.push({ type: "cta" });
    }
    return blocks;
  }, [body, hasSelectedCta, ctaPlaceholderCount]);
  const previewSubject = useMemo(() => previewReplace(subject), [subject]);
  const previewFooterHtml = useMemo(() => buildSIXFLFooterHtml(), []);

  function insertTokenAtCursor(token: string) {
    const textarea = bodyTextareaRef.current;

    if (!textarea) {
      setBody((current) => {
        if (token === "{{cta}}" && current.includes("{{cta}}")) {
          return current;
        }
        const spacer =
          current.length === 0
            ? ""
            : token === "{{cta}}"
              ? "\n\n"
              : current.endsWith(" ") || current.endsWith("\n")
                ? ""
                : " ";
        return `${current}${spacer}${token}`;
      });
      return;
    }

    const start = textarea.selectionStart ?? body.length;
    const end = textarea.selectionEnd ?? body.length;

    if (token === "{{cta}}" && body.includes("{{cta}}")) {
      textarea.focus();
      return;
    }

    const before = body.slice(0, start);
    const after = body.slice(end);

    let insertValue = token;

    if (token === "{{cta}}") {
      const needsLeadingBreak = start > 0 && !before.slice(-2).includes("\n");
      const needsTrailingBreak = end < body.length && !after.slice(0, 2).includes("\n");
      insertValue = `${needsLeadingBreak ? "\n\n" : ""}{{cta}}${needsTrailingBreak ? "\n\n" : ""}`;
    } else {
      const needsLeadingSpace = before.length > 0 && !before.endsWith(" ") && !before.endsWith("\n");
      const needsTrailingSpace = after.length > 0 && !after.startsWith(" ") && !after.startsWith("\n");
      insertValue = `${needsLeadingSpace ? " " : ""}${token}${needsTrailingSpace ? " " : ""}`;
    }

    const nextValue = `${before}${insertValue}${after}`;
    const nextCursor = start + insertValue.length;
    setBody(nextValue);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  }

  return (
    <form action={formAction} className="space-y-8">
      {initialValues?.id ? <input type="hidden" name="id" value={initialValues.id} /> : null}
      <input type="hidden" name="audience" value={audience} />
      <input type="hidden" name="interestType" value={interestType} />
      <input type="hidden" name="ctaUrlKey" value={ctaUrlKey} />
      <input type="hidden" name="isActive" value={String(isActive)} />

      <section className="grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <div className="space-y-8">
          <div className="rounded-3xl border border-white/10 bg-neutral-950/90 p-6">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-white">Template details</h2>
              <p className="mt-1 text-sm text-neutral-400">Keep this clean and reusable. Keys should stay stable once used.</p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium text-white">Template name</label>
                <input id="name" name="name" value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/50" />
                {state?.errors?.name?.[0] ? <p className="text-sm text-red-400">{state.errors.name[0]}</p> : null}
              </div>

              <div className="space-y-2">
                <label htmlFor="key" className="text-sm font-medium text-white">Template key</label>
                <input id="key" name="key" value={key} onChange={(event) => setKey(slugifyTemplateKey(event.target.value))} className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/50" />
                {state?.errors?.key?.[0] ? <p className="text-sm text-red-400">{state.errors.key[0]}</p> : null}
              </div>

              <div className="space-y-2 md:col-span-2">
                <label htmlFor="description" className="text-sm font-medium text-white">Description</label>
                <textarea id="description" name="description" value={description} onChange={(event) => setDescription(event.target.value)} rows={4} className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/50" />
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-neutral-950/90 p-6">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-white">Audience</h2>
              <p className="mt-1 text-sm text-neutral-400">Pick who this is for. This drives filtering and keeps templates organised.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {AUDIENCE_OPTIONS.map((option) => {
                const selected = audience === option.value;
                return (
                  <button key={option.value} type="button" onClick={() => setAudience(option.value)} className={["min-h-[128px] rounded-2xl border px-4 py-4 text-left transition", selected ? "border-emerald-400/50 bg-emerald-500/10" : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"] .join(" ")}>
                    <div className="text-sm font-semibold text-white">{option.label}</div>
                    <div className="mt-2 text-sm leading-6 text-neutral-400">{option.description}</div>
                  </button>
                );
              })}
            </div>
            {state?.errors?.audience?.[0] ? <p className="mt-3 text-sm text-red-400">{state.errors.audience[0]}</p> : null}

            <div className="mt-6">
              <div className="mb-2 text-sm font-medium text-white">Interest type</div>
              <div className="flex flex-wrap gap-2">
                {INTEREST_TYPE_OPTIONS.map((option) => {
                  const selected = interestType === option.value;
                  return (
                    <button key={option.label} type="button" onClick={() => setInterestType(option.value)} className={["rounded-full border px-4 py-2 text-sm transition", selected ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/[0.03] text-neutral-300 hover:border-white/20 hover:bg-white/[0.05]"] .join(" ")}>
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-neutral-950/90 p-6">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-white">Email content</h2>
              <p className="mt-1 text-sm text-neutral-400">Write the message body normally. Paste <span className="text-white">{"{{cta}}"}</span> where you want the button to appear.</p>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="subject" className="text-sm font-medium text-white">Subject</label>
                <input id="subject" name="subject" value={subject} onChange={(event) => setSubject(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/50" />
                {state?.errors?.subject?.[0] ? <p className="text-sm text-red-400">{state.errors.subject[0]}</p> : null}
              </div>

              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Quick insert</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {QUICK_INSERT_TOKENS.map((token) => (
                    <button key={token} type="button" onClick={() => insertTokenAtCursor(token)} className="rounded-full border border-emerald-500/25 bg-black/30 px-3 py-1.5 text-sm text-emerald-300 transition hover:border-emerald-400/40 hover:bg-emerald-500/10">
                      {token}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-sm leading-6 text-neutral-300">Operational emails can use fixture and payment variables, including <span className="text-white">{"{{fixtureUrl}}"}</span>, <span className="text-white">{"{{fixturesUrl}}"}</span>, and <span className="text-white">{"{{paymentUrl}}"}</span>.</p>
              </div>

              {ctaPlaceholderCount > 1 ? <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">Only one <span className="font-semibold text-white">{"{{cta}}"}</span> should be used in a template.</div> : null}

              <div className="space-y-2">
                <label htmlFor="body" className="text-sm font-medium text-white">Message body</label>
                <textarea ref={bodyTextareaRef} id="body" name="body" value={body} onChange={(event) => setBody(event.target.value)} rows={16} className="min-h-[420px] w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-white outline-none focus:border-emerald-400/50" />
                {state?.errors?.body?.[0] ? <p className="text-sm text-red-400">{state.errors.body[0]}</p> : null}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-neutral-950/90 p-6">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-white">Call to action</h2>
              <p className="mt-1 text-sm text-neutral-400">Set the button text and destination. Place it in the message with <span className="text-white">{"{{cta}}"}</span>.</p>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="ctaLabel" className="text-sm font-medium text-white">CTA button text</label>
                  <input id="ctaLabel" name="ctaLabel" value={ctaLabel} onChange={(event) => setCtaLabel(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/50" />
                  {state?.errors?.ctaLabel?.[0] ? <p className="text-sm text-red-400">{state.errors.ctaLabel[0]}</p> : null}
                </div>

                <button type="button" onClick={() => insertTokenAtCursor("{{cta}}") } className="inline-flex rounded-xl border border-emerald-500/20 px-3 py-2 text-sm text-emerald-300 transition hover:bg-emerald-500/10">Insert {{"{{cta}}"}} at cursor</button>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-neutral-300">
                  <div className="font-medium text-white">Selected CTA</div>
                  <div className="mt-2">{selectedCtaOption.value ? `${selectedCtaOption.label} (${selectedCtaOption.value})` : "No button selected"}</div>
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-medium text-white">CTA destination</div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {CTA_OPTIONS.map((option) => {
                    const selected = ctaUrlKey === option.value;
                    return (
                      <button key={option.value || "none"} type="button" onClick={() => setCtaUrlKey(option.value)} className={["rounded-2xl border px-4 py-4 text-left transition", selected ? "border-emerald-400/50 bg-emerald-500/10" : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"] .join(" ")}>
                        <div className="text-sm font-semibold text-white">{option.label}</div>
                        <div className="mt-1 text-xs leading-5 text-neutral-400">{option.description}</div>
                        {option.previewUrl ? <div className="mt-3 truncate text-xs text-emerald-300/90">{option.previewUrl}</div> : null}
                      </button>
                    );
                  })}
                </div>
                {state?.errors?.ctaUrlKey?.[0] ? <p className="mt-3 text-sm text-red-400">{state.errors.ctaUrlKey[0]}</p> : null}
              </div>
            </div>
          </div>

          {state?.message || state?.error ? (
            <div className={["rounded-2xl border px-4 py-3 text-sm", state?.success || state?.ok ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" : "border-red-500/25 bg-red-500/10 text-red-300"].join(" ")}>
              {state?.error || state?.message}
            </div>
          ) : null}

          <div className="flex items-center gap-3">
            <SubmitButton mode={mode} />
          </div>
        </div>

        <aside className="rounded-3xl border border-emerald-500/20 bg-[#04120d] p-6 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]">
          <div className="mb-5">
            <div className="text-sm font-medium text-white/70">Live preview</div>
            <p className="mt-2 text-sm leading-6 text-neutral-400">Preview uses sample SIXFL values, renders the CTA where <span className="text-white">{"{{cta}}"}</span> appears, and shows the automatic SIXFL footer.</p>
          </div>

          <div className="mx-auto max-w-3xl overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-[0_12px_50px_rgba(0,0,0,0.18)]">
            <div className="px-6 pt-6 md:px-8 md:pt-8">
              <div className="text-xl font-semibold leading-tight text-[#111827]">{previewSubject || "Your email subject preview"}</div>
              <div className="mt-8 space-y-6 text-[15px] leading-8 text-[#111827]">
                {previewBlocks.length > 0 ? previewBlocks.map((block, index) => block.type === "cta" ? (hasSelectedCta ? <div key={`cta-${index}`} className="pt-1"><div className="inline-flex items-center justify-center rounded-xl bg-[#1E5A43] px-5 py-3 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(0,0,0,0.15)]">{ctaLabel}</div>{selectedCtaOption.previewUrl ? <div className="mt-3 break-all text-sm text-[#1E5A43]">{selectedCtaOption.previewUrl}</div> : null}</div> : null) : <p key={`p-${index}`} className="whitespace-pre-wrap">{block.content}</p>) : <p className="text-neutral-500">Your email body preview will appear here.</p>}
              </div>
            </div>
            <div className="px-6 pb-6 pt-8 md:px-8 md:pb-8" dangerouslySetInnerHTML={{ __html: previewFooterHtml }} />
          </div>
        </aside>
      </section>
    </form>
  );
}