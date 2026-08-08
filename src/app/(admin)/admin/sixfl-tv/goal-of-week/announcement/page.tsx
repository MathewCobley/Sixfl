import Link from "next/link";

import { requireAdmin } from "@/lib/requireAdmin";
import {
  getGoalOfWeekAnnouncementRecipients,
  getGoalOfWeekLaunchTemplate,
  sendGoalOfWeekLaunchAnnouncementAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Goal of the Week announcement | SIXFL Admin" };

function previewTemplateBody(body: string, ctaLabel: string | null) {
  return body
    .replaceAll("{{firstName}}", "[first name]")
    .replaceAll(
      "{{cta}}",
      ctaLabel ? `[BUTTON: ${ctaLabel}]` : "",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default async function GoalOfWeekAnnouncementPage({
  searchParams,
}: {
  searchParams?: Promise<{
    sent?: string;
    queued?: string;
    skipped?: string;
    already?: string;
    failed?: string;
    template?: string;
  }>;
}) {
  await requireAdmin();
  const [recipients, template] = await Promise.all([
    getGoalOfWeekAnnouncementRecipients(),
    getGoalOfWeekLaunchTemplate(),
  ]);
  const sp = (await searchParams) ?? {};
  const hasResult = sp.sent === "1";
  const canSend = Boolean(template?.isActive && recipients.length > 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/admin/sixfl-tv/goal-of-week"
          className="text-sm font-semibold text-fuchsia-200 hover:text-fuchsia-100"
        >
          ← Back to Goal of the Week
        </Link>
        <Link
          href="/admin/sixfl-tv"
          className="text-sm text-white/55 hover:text-white"
        >
          SIXFL TV admin
        </Link>
      </div>

      <section className="rounded-3xl border border-fuchsia-400/25 bg-[radial-gradient(circle_at_top_right,rgba(217,70,239,0.18),transparent_38%),rgba(255,255,255,0.04)] p-6 lg:p-8">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-fuchsia-100/70">
          Goal of the Week launch
        </p>
        <h1 className="mt-2 text-3xl font-black text-white">
          Announce player nominations & voting
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
          This queues one SIXFL-branded email to each distinct active player or captain account with a saved email address. It is deduplicated, so pressing send again will not queue a second copy for somebody who already has this launch announcement.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">Recipients found</div>
            <div className="mt-2 text-3xl font-black text-white">{recipients.length}</div>
            <div className="mt-1 text-xs text-white/45">Active SIXFL players and captains</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 sm:col-span-2">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">Audience rule</div>
            <p className="mt-2 text-sm leading-6 text-white/65">
              Only users attached to an active season team — as a player/team member or captain — are included. Prospects, old/inactive teams and people without an email address are not included.
            </p>
          </div>
        </div>
      </section>

      {hasResult ? (
        <section className="rounded-3xl border border-emerald-400/25 bg-emerald-500/10 p-5 text-emerald-50">
          <h2 className="text-lg font-black">Announcement queued</h2>
          <p className="mt-2 text-sm leading-6">
            Queued: {sp.queued ?? "0"} · Skipped: {sp.skipped ?? "0"} · Already queued/sent: {sp.already ?? "0"} · Failed: {sp.failed ?? "0"}.
          </p>
        </section>
      ) : null}

      {sp.template === "missing" || !template ? (
        <section className="rounded-3xl border border-red-400/25 bg-red-500/10 p-5 text-red-100">
          The Goal of the Week launch email template is missing. Wait for the database migration to deploy before sending.
        </section>
      ) : null}

      {sp.template === "inactive" || (template && !template.isActive) ? (
        <section className="rounded-3xl border border-amber-400/25 bg-amber-500/10 p-5 text-amber-100">
          The Goal of the Week launch email template is inactive. Open the template, amend it if needed, and switch it back on before sending.
        </section>
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 lg:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-fuchsia-200/70">Editable email template</p>
            <h2 className="mt-2 text-2xl font-black text-white">
              {template?.subject ?? "Goal of the Week launch email"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/50">
              The preview below is read from the saved Admin template. Amend the subject, wording or button there and this page will use the new version automatically.
            </p>
          </div>

          {template ? (
            <Link
              href={`/admin/templates/${template.id}`}
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-2xl border border-fuchsia-300/30 bg-fuchsia-500/10 px-4 py-2.5 text-sm font-black text-fuchsia-100 transition hover:bg-fuchsia-500/15"
            >
              Edit email template
            </Link>
          ) : (
            <Link
              href="/admin/templates?type=campaign&channel=EMAIL"
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-white/70"
            >
              Open templates
            </Link>
          )}
        </div>

        {template ? (
          <>
            <div className="mt-5 flex flex-wrap gap-2 text-xs">
              <span className={`rounded-full border px-3 py-1 ${template.isActive ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100" : "border-amber-400/20 bg-amber-500/10 text-amber-100"}`}>
                {template.isActive ? "Active template" : "Inactive template"}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-white/50">
                Template: {template.name}
              </span>
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-5 text-sm leading-6 text-white/70">
              <div className="mb-4 border-b border-white/10 pb-4">
                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Subject</span>
                <div className="mt-1 font-semibold text-white">{template.subject}</div>
              </div>
              <div className="whitespace-pre-wrap">
                {previewTemplateBody(template.body, template.ctaLabel)}
              </div>
            </div>
          </>
        ) : null}
      </section>

      <section className="rounded-3xl border border-amber-400/25 bg-amber-500/[0.08] p-6">
        <h2 className="text-xl font-black text-white">Ready to send?</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-50/70">
          Edit and save the template first. When you return here, check this preview again. The send action reads the latest saved template at the moment you press the button.
        </p>

        <form action={sendGoalOfWeekLaunchAnnouncementAction} className="mt-5">
          <button
            type="submit"
            disabled={!canSend}
            className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-fuchsia-300 px-6 py-3 text-sm font-black text-black transition hover:bg-fuchsia-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Queue announcement to {recipients.length} people
          </button>
        </form>
      </section>
    </div>
  );
}
