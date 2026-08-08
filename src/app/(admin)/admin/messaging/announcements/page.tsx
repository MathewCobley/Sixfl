import Link from "next/link";

import {
  getAnnouncementAlreadyQueuedEmails,
  getAnnouncementTemplateCompatibility,
  getSystemAnnouncementAudience,
} from "@/lib/communications/system-announcements";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { sendSystemAnnouncementAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Announcements | SIXFL Admin",
};

type SearchParams = {
  template?: string;
  sent?: string;
  queued?: string;
  skipped?: string;
  already?: string;
  failed?: string;
  error?: string;
};

function previewBody(body: string, ctaLabel: string | null) {
  return body
    .replaceAll("{{firstName}}", "[first name]")
    .replaceAll("{{name}}", "[name]")
    .replaceAll("{{fullName}}", "[full name]")
    .replaceAll("{{captainDashboardUrl}}", "https://www.sixfl.co.uk/dashboard")
    .replaceAll("{{signInUrl}}", "https://www.sixfl.co.uk/dashboard")
    .replaceAll("{{signupUrl}}", "https://www.sixfl.co.uk/register-interest")
    .replaceAll("{{link}}", "https://www.sixfl.co.uk/dashboard")
    .replaceAll("{{cta}}", ctaLabel ? `[Button: ${ctaLabel}]` : "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function resultNumber(value?: string) {
  const parsed = Number(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};
  const templates = await prisma.emailTemplate.findMany({
    where: { isActive: true },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      key: true,
      name: true,
      description: true,
      subject: true,
      body: true,
      ctaLabel: true,
      ctaUrlKey: true,
      audience: true,
    },
  });

  const requestedTemplate = sp.template?.trim() || "";
  const selectedTemplate =
    templates.find(
      (template) =>
        template.id === requestedTemplate || template.key === requestedTemplate,
    ) ?? templates[0] ?? null;

  const audience = await getSystemAnnouncementAudience();
  const alreadyQueuedEmails = selectedTemplate
    ? await getAnnouncementAlreadyQueuedEmails(selectedTemplate.id)
    : new Set<string>();
  const compatibility = selectedTemplate
    ? getAnnouncementTemplateCompatibility({
        subject: selectedTemplate.subject,
        body: selectedTemplate.body,
        ctaLabel: selectedTemplate.ctaLabel,
        ctaUrlKey: selectedTemplate.ctaUrlKey,
      })
    : null;

  const alreadyCount = audience.filter((person) =>
    alreadyQueuedEmails.has(person.email),
  ).length;
  const remainingCount = Math.max(0, audience.length - alreadyCount);
  const hasResult = sp.sent === "1";

  return (
    <div className="w-full px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-3xl border border-emerald-400/20 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.16),transparent_36%),rgba(255,255,255,0.04)] p-6 lg:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200/70">
            System-wide email
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Announcements
          </h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-white/65 sm:text-base">
            Send one existing SIXFL email template to every unique email address saved in the system. The audience is deduplicated by normalised email address, so the same address receives this announcement only once even if it appears as a user, player, team contact, lead or notification contact.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
                Unique emails in system
              </div>
              <div className="mt-2 text-3xl font-black text-white">{audience.length}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
                Already queued / sent
              </div>
              <div className="mt-2 text-3xl font-black text-white">{alreadyCount}</div>
              <div className="mt-1 text-xs text-white/40">For the selected template</div>
            </div>
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100/60">
                Remaining
              </div>
              <div className="mt-2 text-3xl font-black text-emerald-50">{remainingCount}</div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-5 text-white/50">
            Sources include saved user accounts, team contact emails, player/prospect emails, leads, PlayerPool and existing notification recipients. SIXFL's existing suppression and email-preference rules still apply, so suppressed or disabled recipients are recorded as skipped rather than bypassed.
          </div>
        </section>

        {sp.error ? (
          <section className="rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100">
            {sp.error}
          </section>
        ) : null}

        {hasResult ? (
          <section className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm text-emerald-50">
            <strong>Announcement processed.</strong>{" "}
            Queued: {resultNumber(sp.queued)} · Skipped by normal email rules: {resultNumber(sp.skipped)} · Already queued/sent: {resultNumber(sp.already)} · Failed: {resultNumber(sp.failed)}.
          </section>
        ) : null}

        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 lg:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                1 · Choose existing template
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                Use the email system you already have
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/55">
                Announcements does not have its own email editor. Create or amend the message in Admin → Templates, then select it here.
              </p>
            </div>
            <Link
              href="/admin/templates/new"
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white/80 transition hover:bg-white/[0.08]"
            >
              Create email template
            </Link>
          </div>

          {templates.length > 0 ? (
            <form method="get" action="/admin/messaging/announcements" className="mt-5 flex flex-col gap-3 sm:flex-row">
              <select
                name="template"
                defaultValue={selectedTemplate?.id ?? ""}
                className="min-h-11 min-w-0 flex-1 rounded-2xl border border-white/10 bg-[#0d1428] px-4 text-sm text-white"
              >
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} · {template.audience}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-5 py-3 text-sm font-semibold text-emerald-100"
              >
                Load template
              </button>
            </form>
          ) : (
            <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
              There are no active email templates yet.
            </div>
          )}
        </section>

        {selectedTemplate ? (
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 lg:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fuchsia-200/65">
                  2 · Review
                </p>
                <h2 className="mt-2 text-2xl font-black text-white">{selectedTemplate.name}</h2>
                {selectedTemplate.description ? (
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">
                    {selectedTemplate.description}
                  </p>
                ) : null}
              </div>
              <Link
                href={`/admin/templates/${selectedTemplate.id}`}
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-fuchsia-300/25 bg-fuchsia-500/10 px-4 text-sm font-semibold text-fuchsia-100"
              >
                Edit this email template
              </Link>
            </div>

            {compatibility && !compatibility.compatible ? (
              <div className="mt-5 rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">
                This template uses recipient-specific features that cannot safely be sent to every email address.
                {compatibility.unsupportedTokens.length > 0
                  ? ` Unsupported placeholders: ${compatibility.unsupportedTokens.map((token) => `{{${token}}}`).join(", ")}.`
                  : ""}
                {compatibility.unsupportedCta
                  ? ` The ${compatibility.unsupportedCta} button destination is also recipient-specific.`
                  : ""}
              </div>
            ) : null}

            <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-black/25">
              <div className="border-b border-white/10 px-5 py-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Subject</div>
                <div className="mt-1 font-semibold text-white">{selectedTemplate.subject}</div>
              </div>
              <pre className="whitespace-pre-wrap px-5 py-5 font-sans text-sm leading-6 text-white/70">
                {previewBody(selectedTemplate.body, selectedTemplate.ctaLabel)}
              </pre>
            </div>
          </section>
        ) : null}

        {selectedTemplate ? (
          <section className="rounded-3xl border border-amber-400/25 bg-amber-500/[0.08] p-6 lg:p-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/65">
              3 · Queue once
            </p>
            <h2 className="mt-2 text-2xl font-black text-white">Send this announcement</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-amber-50/70">
              This uses the normal SIXFL notification queue, branded email renderer, preferences, suppression handling and delivery processing. Re-running the same announcement only considers email addresses that have not already been queued or sent for this template.
            </p>

            <form action={sendSystemAnnouncementAction} className="mt-5 space-y-4">
              <input type="hidden" name="templateId" value={selectedTemplate.id} />
              <label className="flex max-w-3xl items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
                <input
                  type="checkbox"
                  name="confirm"
                  value="yes"
                  required
                  className="mt-1 h-4 w-4 rounded border-white/20"
                />
                <span>
                  I have reviewed the selected template and understand that this will queue it to every remaining unique saved email address.
                </span>
              </label>

              <button
                type="submit"
                disabled={!compatibility?.compatible || remainingCount === 0}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 py-3 text-sm font-black text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {remainingCount > 0
                  ? `Queue announcement to ${remainingCount} email${remainingCount === 1 ? "" : "s"}`
                  : "Everyone has already received this announcement"}
              </button>
            </form>
          </section>
        ) : null}
      </div>
    </div>
  );
}
