// ========================================
// File: src/components/admin/email-templates/EmailTemplateForm.tsx
// ========================================

"use client";

// ========================================
// Imports
// ========================================

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { buildSIXFLFooterHtml } from "@/lib/email/footer";

// ========================================
// Types
// ========================================

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
  | "captainDashboardUrl";

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

// ========================================
// Constants
// ========================================

const INITIAL_STATE: FormState = {
  ok: false,
  success: false,
  message: "",
  error: "",
  errors: {},
};

const PREVIEW_CLAIM_CODE = "H862NY";
const PREVIEW_CLAIM_LINK = `https://www.sixfl.co.uk/claim?code=${PREVIEW_CLAIM_CODE}`;

const AUDIENCE_OPTIONS: Array<{
  value: TemplateAudience;
  label: string;
  description: string;
}> = [
  {
    value: "LEAD",
    label: "Lead",
    description: "General lead nurture and enquiry follow-up.",
  },
  {
    value: "TEAM",
    label: "Team",
    description: "Team-specific admin or captain communication.",
  },
  {
    value: "PLAYER",
    label: "Player",
    description: "Player sign-up and player messaging.",
  },
  {
    value: "REFEREE",
    label: "Referee",
    description: "Referee onboarding and operational emails.",
  },
  {
    value: "GENERAL",
    label: "General",
    description: "Reusable template not tied to one audience.",
  },
];

const INTEREST_TYPE_OPTIONS: Array<{
  value: InterestTypeValue;
  label: string;
}> = [
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
  "{{claimCode}}",
  "{{claimLink}}",
  "{{captainDashboardUrl}}",
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
  {
    value: "",
    label: "No button",
    description: "Use plain email copy only.",
  },
  {
    value: "signupUrl",
    label: "Register interest",
    description: "Links to the SIXFL registration / interest page.",
    previewUrl: "https://www.sixfl.co.uk/register-interest",
  },
  {
    value: "manageTeamUrl",
    label: "Manage team",
    description: "Links to the team claim / management flow.",
    previewUrl: PREVIEW_CLAIM_LINK,
  },
  {
    value: "captainDashboardUrl",
    label: "Captain dashboard sign-in",
    description:
      "Links captains into the claim and dashboard access flow for their team.",
    previewUrl: PREVIEW_CLAIM_LINK,
  },
  {
    value: "paymentUrl",
    label: "Payment link",
    description: "Use a payment link supplied when the email is sent.",
  },
];

// ========================================
// Helpers
// ========================================

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
    .replaceAll("{{claimCode}}", PREVIEW_CLAIM_CODE)
    .replaceAll("{{claimLink}}", PREVIEW_CLAIM_LINK)
    .replaceAll("{{captainDashboardUrl}}", PREVIEW_CLAIM_LINK)
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

// ========================================
// Component
// ========================================

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

  const [state, formAction] = useActionState(
    submitTemplateAction,
    INITIAL_STATE,
  );

  const [key, setKey] = useState(initialValues?.key ?? "");
  const [name, setName] = useState(initialValues?.name ?? "");
  const [description, setDescription] = useState(
    initialValues?.description ?? "",
  );
  const [audience, setAudience] = useState<TemplateAudience>(
    initialValues?.audience ?? "LEAD",
  );
  const [interestType, setInterestType] = useState<InterestTypeValue>(
    initialValues?.interestType ?? "",
  );
  const [subject, setSubject] = useState(initialValues?.subject ?? "");
  const [body, setBody] = useState(initialValues?.body ?? "");
  const [ctaLabel, setCtaLabel] = useState(initialValues?.ctaLabel ?? "");
  const [ctaUrlKey, setCtaUrlKey] = useState<CtaUrlKeyValue>(
    initialValues?.ctaUrlKey ?? "",
  );
  const [isActive, setIsActive] = useState(initialValues?.isActive ?? true);

  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (mode === "create" && !key.trim() && name.trim()) {
      setKey(slugifyTemplateKey(name));
    }
  }, [mode, name, key]);

  const previewSubject = useMemo(() => previewReplace(subject), [subject]);

  const selectedCtaOption = useMemo(
    () =>
      CTA_OPTIONS.find((option) => option.value === ctaUrlKey) ?? CTA_OPTIONS[0],
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

  const previewFooterHtml = useMemo(() => buildSIXFLFooterHtml(), []);

  const bodyError = state?.errors?.body?.[0];
  const keyError = state?.errors?.key?.[0];
  const nameError = state?.errors?.name?.[0];
  const audienceError = state?.errors?.audience?.[0];
  const interestTypeError = state?.errors?.interestType?.[0];
  const subjectError = state?.errors?.subject?.[0];
  const ctaLabelError = state?.errors?.ctaLabel?.[0];
  const ctaUrlKeyError = state?.errors?.ctaUrlKey?.[0];

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

    let insertValue = token;

    if (token === "{{cta}}") {
      const needsLeadingBreak =
        start > 0 &&
        !body.slice(Math.max(0, start - 2), start).includes("\n");
      const needsTrailingBreak =
        end < body.length &&
        !body.slice(end, Math.min(body.length, end + 2)).includes("\n");

      insertValue = `${needsLeadingBreak ? "\n\n" : ""}{{cta}}${needsTrailingBreak ? "\n\n" : ""}`;
    } else {
      const before = body.slice(0, start);
      const after = body.slice(end);
      const needsLeadingSpace =
        before.length > 0 && !before.endsWith(" ") && !before.endsWith("\n");
      const needsTrailingSpace =
        after.length > 0 && !after.startsWith(" ") && !after.startsWith("\n");

      insertValue = `${needsLeadingSpace ? " " : ""}${token}${needsTrailingSpace ? " " : ""}`;
    }

    const nextValue = `${body.slice(0, start)}${insertValue}${body.slice(end)}`;
    const nextCursor = start + insertValue.length;

    setBody(nextValue);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  }

  async function copyCtaPlaceholder() {
    try {
      await navigator.clipboard.writeText("{{cta}}");
    } catch {
      // no-op
    }
  }

  return (
    <form action={formAction} className="space-y-8">
      {initialValues?.id ? (
        <input type="hidden" name="id" value={initialValues.id} />
      ) : null}

      <input type="hidden" name="audience" value={audience} />
      <input type="hidden" name="interestType" value={interestType} />
      <input type="hidden" name="ctaUrlKey" value={ctaUrlKey} />
      <input type="hidden" name="isActive" value={String(isActive)} />

      <div className="space-y-8">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <section className="rounded-3xl border border-white/10 bg-neutral-950/90 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-white">
                Template details
              </h2>
              <p className="mt-1 text-sm text-neutral-400">
                Keep this clean and reusable. Keys should stay stable once used.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium text-white">
                  Template name
                </label>
                <input
                  id="name"
                  name="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Team follow-up"
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition placeholder:text-neutral-500 focus:border-emerald-400/50 focus:bg-white/[0.05]"
                />
                {nameError ? (
                  <p className="text-sm text-red-400">{nameError}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <label htmlFor="key" className="text-sm font-medium text-white">
                  Template key
                </label>
                <input
                  id="key"
                  name="key"
                  value={key}
                  onChange={(event) =>
                    setKey(slugifyTemplateKey(event.target.value))
                  }
                  placeholder="team-follow-up"
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition placeholder:text-neutral-500 focus:border-emerald-400/50 focus:bg-white/[0.05]"
                />
                {keyError ? (
                  <p className="text-sm text-red-400">{keyError}</p>
                ) : null}
              </div>

              <div className="space-y-2 md:col-span-2">
                <label
                  htmlFor="description"
                  className="text-sm font-medium text-white"
                >
                  Description
                </label>
                <textarea
                  id="description"
                  name="description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={4}
                  placeholder="Explain when this template should be used."
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition placeholder:text-neutral-500 focus:border-emerald-400/50 focus:bg-white/[0.05]"
                />
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-neutral-950/90 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-white">
                Template status
              </h2>
              <p className="mt-1 text-sm text-neutral-400">
                Control whether this template is available in admin email flows.
              </p>
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
                className="h-5 w-5 rounded border-white/20 bg-black text-emerald-500 focus:ring-emerald-500"
              />
              <span className="text-sm font-medium text-white">
                Template is active
              </span>
            </label>
          </section>
        </div>

        <section className="rounded-3xl border border-white/10 bg-neutral-950/90 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-white">Audience</h2>
            <p className="mt-1 text-sm text-neutral-400">
              Pick who this is for. This drives filtering and keeps templates
              organised.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {AUDIENCE_OPTIONS.map((option) => {
              const selected = audience === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setAudience(option.value)}
                  className={[
                    "min-h-[138px] rounded-2xl border px-4 py-4 text-left transition",
                    selected
                      ? "border-emerald-400/50 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(16,185,129,0.12)]"
                      : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]",
                  ].join(" ")}
                >
                  <div className="text-sm font-semibold text-white">
                    {option.label}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-neutral-400">
                    {option.description}
                  </div>
                </button>
              );
            })}
          </div>

          {audienceError ? (
            <p className="mt-3 text-sm text-red-400">{audienceError}</p>
          ) : null}

          <div className="mt-6">
            <div className="mb-2 text-sm font-medium text-white">
              Interest type
            </div>
            <div className="flex flex-wrap gap-2">
              {INTEREST_TYPE_OPTIONS.map((option) => {
                const selected = interestType === option.value;

                return (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => setInterestType(option.value)}
                    className={[
                      "rounded-full border px-4 py-2 text-sm transition",
                      selected
                        ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-300"
                        : "border-white/10 bg-white/[0.03] text-neutral-300 hover:border-white/20 hover:bg-white/[0.05]",
                    ].join(" ")}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            {interestTypeError ? (
              <p className="mt-3 text-sm text-red-400">{interestTypeError}</p>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-neutral-950/90 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-white">Email content</h2>
            <p className="mt-1 text-sm text-neutral-400">
              Write the message body normally. Paste{" "}
              <span className="text-white">{"{{cta}}"}</span> where you want the
              button to appear.
            </p>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <label
                htmlFor="subject"
                className="text-sm font-medium text-white"
              >
                Subject
              </label>
              <input
                id="subject"
                name="subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Your SIXFL follow-up"
                className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition placeholder:text-neutral-500 focus:border-emerald-400/50 focus:bg-white/[0.05]"
              />
              {subjectError ? (
                <p className="text-sm text-red-400">{subjectError}</p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
                Quick insert
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {QUICK_INSERT_TOKENS.map((token) => (
                  <button
                    key={token}
                    type="button"
                    onClick={() => insertTokenAtCursor(token)}
                    className="rounded-full border border-emerald-500/25 bg-black/30 px-3 py-1.5 text-sm text-emerald-300 transition hover:border-emerald-400/40 hover:bg-emerald-500/10"
                  >
                    {token}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-sm leading-6 text-neutral-300">
                Team access emails can use{" "}
                <span className="text-white">{"{{claimCode}}"}</span>,{" "}
                <span className="text-white">{"{{claimLink}}"}</span>, and{" "}
                <span className="text-white">{"{{captainDashboardUrl}}"}</span>.
                Use <span className="text-white">{"{{cta}}"}</span> once to
                place the CTA. If you do not include it, the button will appear
                at the end.
              </p>
            </div>

            {ctaPlaceholderCount > 1 ? (
              <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                Only one{" "}
                <span className="font-semibold text-white">{"{{cta}}"}</span>{" "}
                should be used in a template.
              </div>
            ) : null}

            <div className="space-y-2">
              <label htmlFor="body" className="text-sm font-medium text-white">
                Message body
              </label>
              <textarea
                ref={bodyTextareaRef}
                id="body"
                name="body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={16}
                placeholder="Write the email body here..."
                className="min-h-[420px] w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-white outline-none transition placeholder:text-neutral-500 focus:border-emerald-400/50 focus:bg-white/[0.05]"
              />
              {bodyError ? (
                <p className="text-sm text-red-400">{bodyError}</p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-neutral-950/90 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-white">
              Call to action
            </h2>
            <p className="mt-1 text-sm text-neutral-400">
              Set the button text and destination. Place it in the message with{" "}
              <span className="text-white">{"{{cta}}"}</span>.
            </p>
          </div>

          <div className="mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
              Place button in email
            </div>

            <p className="mt-2 text-sm text-neutral-300">
              Copy and paste this into your message where you want the button:
            </p>

            <div className="mt-3 flex items-center justify-between rounded-xl border border-white/10 bg-black/40 px-4 py-3">
              <code className="text-sm font-mono text-emerald-300">
                {"{{cta}}"}
              </code>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => insertTokenAtCursor("{{cta}}")}
                  className="rounded-lg border border-emerald-500/20 px-3 py-1.5 text-xs text-emerald-300 transition hover:bg-emerald-500/10"
                >
                  Insert at cursor
                </button>

                <button
                  type="button"
                  onClick={copyCtaPlaceholder}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white transition hover:bg-white/10"
                >
                  Copy
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="space-y-5">
              <div className="space-y-2">
                <label
                  htmlFor="ctaLabel"
                  className="text-sm font-medium text-white"
                >
                  CTA button text
                </label>
                <input
                  id="ctaLabel"
                  name="ctaLabel"
                  value={ctaLabel}
                  onChange={(event) => setCtaLabel(event.target.value)}
                  placeholder="Register your interest"
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition placeholder:text-neutral-500 focus:border-emerald-400/50 focus:bg-white/[0.05]"
                />
                {ctaLabelError ? (
                  <p className="text-sm text-red-400">{ctaLabelError}</p>
                ) : null}
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-neutral-300">
                <div className="font-medium text-white">Selected CTA</div>
                <div className="mt-2">
                  {selectedCtaOption.value
                    ? `${selectedCtaOption.label} (${selectedCtaOption.value})`
                    : "No button selected"}
                </div>
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-medium text-white">
                CTA destination
              </div>
              <div className="grid gap-3 md:grid-cols-5">
                {CTA_OPTIONS.map((option) => {
                  const selected = ctaUrlKey === option.value;

                  return (
                    <button
                      key={option.value || "none"}
                      type="button"
                      onClick={() => setCtaUrlKey(option.value)}
                      className={[
                        "rounded-2xl border px-4 py-4 text-left transition",
                        selected
                          ? "border-emerald-400/50 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(16,185,129,0.12)]"
                          : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]",
                      ].join(" ")}
                    >
                      <div className="text-sm font-semibold text-white">
                        {option.label}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-neutral-400">
                        {option.description}
                      </div>
                      {option.previewUrl ? (
                        <div className="mt-3 truncate text-xs text-emerald-300/90">
                          {option.previewUrl}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {ctaUrlKeyError ? (
                <p className="mt-3 text-sm text-red-400">{ctaUrlKeyError}</p>
              ) : null}
            </div>
          </div>
        </section>

        {state?.message || state?.error ? (
          <div
            className={[
              "rounded-2xl border px-4 py-3 text-sm",
              state?.success || state?.ok
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                : "border-red-500/25 bg-red-500/10 text-red-300",
            ].join(" ")}
          >
            {state?.error || state?.message}
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <SubmitButton mode={mode} />
        </div>

        <aside className="rounded-3xl border border-emerald-500/20 bg-[#04120d] p-6 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]">
          <div className="mb-5">
            <div className="text-sm font-medium text-white/70">
              Live preview
            </div>
            <p className="mt-2 text-sm leading-6 text-neutral-400">
              Preview uses sample SIXFL values, renders the CTA where{" "}
              <span className="text-white">{"{{cta}}"}</span> appears, and shows
              the automatic SIXFL footer exactly as it will appear when sent.
            </p>
          </div>

          <div className="mx-auto max-w-3xl overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-[0_12px_50px_rgba(0,0,0,0.18)]">
            <div className="px-6 pt-6 md:px-8 md:pt-8">
              <div className="text-xl font-semibold leading-tight text-[#111827]">
                {previewSubject || "Your email subject preview"}
              </div>

              <div className="mt-8 space-y-6 text-[15px] leading-8 text-[#111827]">
                {previewBlocks.length > 0 ? (
                  previewBlocks.map((block, index) => {
                    if (block.type === "cta") {
                      return hasSelectedCta ? (
                        <div key={`cta-${index}`} className="pt-1">
                          <div className="inline-flex items-center justify-center rounded-xl bg-[#1E5A43] px-5 py-3 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
                            {ctaLabel}
                          </div>
                          {selectedCtaOption.previewUrl ? (
                            <div className="mt-3 break-all text-sm text-[#1E5A43]">
                              {selectedCtaOption.previewUrl}
                            </div>
                          ) : null}
                        </div>
                      ) : null;
                    }

                    return (
                      <p key={`p-${index}`} className="whitespace-pre-wrap">
                        {block.content}
                      </p>
                    );
                  })
                ) : (
                  <p className="text-neutral-500">
                    Your email body preview will appear here.
                  </p>
                )}
              </div>
            </div>

            <div
              className="px-6 pb-6 pt-8 md:px-8 md:pb-8"
              dangerouslySetInnerHTML={{ __html: previewFooterHtml }}
            />
          </div>

          <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
            <div className="text-sm font-medium text-white/70">
              Preview rules
            </div>
            <p className="mt-3 text-sm leading-6 text-neutral-300">
              Blank lines create separate paragraphs. Use{" "}
              <span className="text-white">{"{{cta}}"}</span> once to place the
              CTA. If omitted, the CTA appears at the end. The SIXFL footer is
              added automatically, so admins do not need to type it into the
              template body.
            </p>
          </div>
        </aside>
      </div>
    </form>
  );
}