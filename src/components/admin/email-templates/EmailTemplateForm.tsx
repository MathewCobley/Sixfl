// ========================================
// File: src/components/admin/email-templates/EmailTemplateForm.tsx
// ========================================

"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

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

const INITIAL_STATE: FormState = {
  ok: false,
  success: false,
  message: "",
  error: "",
  errors: {},
};

const TOKENS = [
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

const INTEREST_TYPE_OPTIONS: Array<{
  value: InterestTypeValue;
  label: string;
}> = [
  { value: "", label: "None" },
  { value: "TEAM", label: "Team" },
  { value: "PLAYER", label: "Player" },
  { value: "REFEREE", label: "Referee" },
];

const CTA_OPTIONS: Array<{
  value: CtaUrlKeyValue;
  label: string;
  previewUrl?: string;
}> = [
  { value: "", label: "No button" },
  {
    value: "signupUrl",
    label: "Register interest",
    previewUrl: "https://www.sixfl.co.uk/register-interest",
  },
  {
    value: "manageTeamUrl",
    label: "Manage team",
    previewUrl: "https://www.sixfl.co.uk/claim?code=H862NY",
  },
  {
    value: "captainDashboardUrl",
    label: "Captain dashboard",
    previewUrl: "https://www.sixfl.co.uk/claim?code=H862NY",
  },
  {
    value: "teamJoinUrl",
    label: "Team join page",
    previewUrl: "https://www.sixfl.co.uk/teams/join/rossett-managed-team",
  },
  {
    value: "fixtureUrl",
    label: "Fixture page",
    previewUrl:
      "https://www.sixfl.co.uk/leagues/rossett-mens-tuesday/fixtures/harrogate-athletic-vs-rossett-vets",
  },
  {
    value: "fixturesUrl",
    label: "Fixtures page",
    previewUrl: "https://www.sixfl.co.uk/leagues/rossett-mens-tuesday/fixtures",
  },
  {
    value: "paymentUrl",
    label: "Payment link",
    previewUrl: "https://www.sixfl.co.uk/pay/charge/demo-token",
  },
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
    .replaceAll(
      "{{fixturesList}}",
      "Tue 21 Apr, 21:20 — Harrogate Athletic vs Rossett Vets\nTue 28 Apr, 20:40 — Rossett Vets vs Boroughbridge United",
    )
    .replaceAll("{{amount}}", "£30.00")
    .replaceAll("{{claimCode}}", "H862NY")
    .replaceAll("{{claimLink}}", "https://www.sixfl.co.uk/claim?code=H862NY")
    .replaceAll(
      "{{captainDashboardUrl}}",
      "https://www.sixfl.co.uk/claim?code=H862NY",
    )
    .replaceAll(
      "{{fixtureUrl}}",
      "https://www.sixfl.co.uk/leagues/rossett-mens-tuesday/fixtures/harrogate-athletic-vs-rossett-vets",
    )
    .replaceAll(
      "{{fixturesUrl}}",
      "https://www.sixfl.co.uk/leagues/rossett-mens-tuesday/fixtures",
    )
    .replaceAll(
      "{{paymentUrl}}",
      "https://www.sixfl.co.uk/pay/charge/demo-token",
    )
    .replaceAll("{{area}}", "Harrogate")
    .replaceAll("{{preferredNight}}", "Tuesday");
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
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (mode === "create" && !key.trim() && name.trim()) {
      setKey(slugifyTemplateKey(name));
    }
  }, [key, mode, name]);

  const selectedCta = useMemo(
    () =>
      CTA_OPTIONS.find((option) => option.value === ctaUrlKey) ??
      CTA_OPTIONS[0],
    [ctaUrlKey],
  );
  const previewSubject = useMemo(() => previewReplace(subject), [subject]);
  const previewBody = useMemo(
    () => previewReplace(body).replaceAll("{{cta}}", ""),
    [body],
  );

  function insertToken(token: string) {
    const textarea = bodyRef.current;

    if (!textarea) {
      setBody((current) => `${current}${current ? "\n" : ""}${token}`);
      return;
    }

    const start = textarea.selectionStart ?? body.length;
    const end = textarea.selectionEnd ?? body.length;
    const next = `${body.slice(0, start)}${token}${body.slice(end)}`;

    setBody(next);

    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + token.length;
      textarea.setSelectionRange(cursor, cursor);
    });
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

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <div className="space-y-8">
          <section className="rounded-3xl border border-white/10 bg-neutral-950/90 p-6">
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
                <label className="text-sm font-medium text-white">
                  Template name
                </label>
                <input
                  name="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/50"
                />
                {state?.errors?.name?.[0] ? (
                  <p className="text-sm text-red-400">
                    {state.errors.name[0]}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-white">
                  Template key
                </label>
                <input
                  name="key"
                  value={key}
                  onChange={(event) =>
                    setKey(slugifyTemplateKey(event.target.value))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/50"
                />
                {state?.errors?.key?.[0] ? (
                  <p className="text-sm text-red-400">
                    {state.errors.key[0]}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-white">
                  Description
                </label>
                <textarea
                  name="description"
                  rows={4}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/50"
                />
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-neutral-950/90 p-6">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-white">Audience</h2>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {(
                ["LEAD", "TEAM", "PLAYER", "REFEREE", "GENERAL"] as const
              ).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAudience(value)}
                  className={[
                    "rounded-2xl border px-4 py-4 text-left text-sm transition",
                    audience === value
                      ? "border-emerald-400/50 bg-emerald-500/10 text-white"
                      : "border-white/10 bg-white/[0.03] text-neutral-300 hover:border-white/20 hover:bg-white/[0.05]",
                  ].join(" ")}
                >
                  {value}
                </button>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {INTEREST_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => setInterestType(option.value)}
                  className={[
                    "rounded-full border px-4 py-2 text-sm transition",
                    interestType === option.value
                      ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-300"
                      : "border-white/10 bg-white/[0.03] text-neutral-300 hover:border-white/20 hover:bg-white/[0.05]",
                  ].join(" ")}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-neutral-950/90 p-6">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-white">
                Email content
              </h2>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-white">
                  Subject
                </label>
                <input
                  name="subject"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/50"
                />
                {state?.errors?.subject?.[0] ? (
                  <p className="text-sm text-red-400">
                    {state.errors.subject[0]}
                  </p>
                ) : null}
              </div>

              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
                  Quick insert
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {TOKENS.map((token) => (
                    <button
                      key={token}
                      type="button"
                      onClick={() => insertToken(token)}
                      className="rounded-full border border-emerald-500/25 bg-black/30 px-3 py-1.5 text-sm text-emerald-300 transition hover:border-emerald-400/40 hover:bg-emerald-500/10"
                    >
                      {token}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-white">
                  Message body
                </label>
                <textarea
                  ref={bodyRef}
                  name="body"
                  rows={16}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  className="min-h-[420px] w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-white outline-none focus:border-emerald-400/50"
                />
                {state?.errors?.body?.[0] ? (
                  <p className="text-sm text-red-400">
                    {state.errors.body[0]}
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-neutral-950/90 p-6">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-white">
                Call to action
              </h2>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white">
                    CTA button text
                  </label>
                  <input
                    name="ctaLabel"
                    value={ctaLabel}
                    onChange={(event) => setCtaLabel(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/50"
                  />
                  {state?.errors?.ctaLabel?.[0] ? (
                    <p className="text-sm text-red-400">
                      {state.errors.ctaLabel[0]}
                    </p>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => insertToken("{{cta}}")}
                  className="inline-flex rounded-xl border border-emerald-500/20 px-3 py-2 text-sm text-emerald-300 transition hover:bg-emerald-500/10"
                >
                  Insert {"{{cta}}"} at cursor
                </button>
              </div>

              <div>
                <div className="mb-2 text-sm font-medium text-white">
                  CTA destination
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {CTA_OPTIONS.map((option) => (
                    <button
                      key={option.value || "none"}
                      type="button"
                      onClick={() => setCtaUrlKey(option.value)}
                      className={[
                        "rounded-2xl border px-4 py-4 text-left transition",
                        ctaUrlKey === option.value
                          ? "border-emerald-400/50 bg-emerald-500/10"
                          : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]",
                      ].join(" ")}
                    >
                      <div className="text-sm font-semibold text-white">
                        {option.label}
                      </div>
                      {option.previewUrl ? (
                        <div className="mt-2 truncate text-xs text-emerald-300/90">
                          {option.previewUrl}
                        </div>
                      ) : null}
                    </button>
                  ))}
                </div>
                {state?.errors?.ctaUrlKey?.[0] ? (
                  <p className="mt-3 text-sm text-red-400">
                    {state.errors.ctaUrlKey[0]}
                  </p>
                ) : null}
              </div>
            </div>
          </section>

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
        </div>

        <aside className="rounded-3xl border border-emerald-500/20 bg-[#04120d] p-6">
          <div className="mb-5">
            <div className="text-sm font-medium text-white/70">
              Live preview
            </div>
          </div>

          <div className="rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_12px_50px_rgba(0,0,0,0.18)]">
            <div className="text-xl font-semibold leading-tight text-[#111827]">
              {previewSubject || "Your email subject preview"}
            </div>

            <div className="mt-8 space-y-6 whitespace-pre-wrap text-[15px] leading-8 text-[#111827]">
              {previewBody || "Your email body preview will appear here."}
            </div>

            {ctaLabel && selectedCta.previewUrl ? (
              <div className="mt-8">
                <div className="inline-flex items-center justify-center rounded-xl bg-[#1E5A43] px-5 py-3 text-sm font-semibold text-white">
                  {ctaLabel}
                </div>
                <div className="mt-3 break-all text-sm text-[#1E5A43]">
                  {selectedCta.previewUrl}
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </form>
  );
}