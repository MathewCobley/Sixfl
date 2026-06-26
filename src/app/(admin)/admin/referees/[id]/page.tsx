// ========================================
// File: src/app/(admin)/admin/referees/[id]/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { NotificationChannel, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  formatMoney,
  formatPenceAsPoundsInput,
  getRefereeProfileByUserId,
} from "@/lib/referees/profile";
import { sendRefereeSmsAction, updateRefereeAction } from "../actions";

type Props = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    updated?: string;
    sms?: string;
    error?: string;
  }>;
};

function formatDate(value: Date | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function getInitials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "R";
  const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

function formatStatus(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function getErrorMessage(error?: string) {
  switch (error) {
    case "missing_referee_details":
      return "Please enter the referee name and email address.";
    case "invalid_referee_email":
      return "Please enter a valid referee email address.";
    case "referee_email_in_use":
      return "That email address is already used by another user.";
    case "invalid_referee_phone":
      return "Please enter a valid UK mobile number for SMS, for example 07700 900123.";
    case "invalid_referee_fee":
      return "Please enter the night fee as a pounds amount, for example 45 or 45.00.";
    case "empty_sms":
      return "Please type an SMS message before sending.";
    case "missing_referee_phone":
      return "Add a valid referee mobile number before sending an SMS.";
    case "sms_not_queued":
      return "The SMS could not be queued. Check the referee phone number and SMS preferences.";
    default:
      return null;
  }
}

function getSmsPreview(body: string) {
  const trimmed = body.trim().replace(/\s+/g, " ");
  if (!trimmed) return "—";
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}

export default async function AdminRefereeProfilePage({ params, searchParams }: Props) {
  await requireAdmin();

  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const errorMessage = getErrorMessage(sp.error);
  const updatedMessage = sp.updated ? "Referee profile saved." : null;
  const smsMessage = sp.sms === "queued" ? "SMS queued through the SIXFL notification system." : null;

  const referee = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      image: true,
      createdFromLeadId: true,
      refereedFixtures: {
        orderBy: [{ kickoffAt: "asc" }],
        select: {
          id: true,
          status: true,
          kickoffAt: true,
          league: {
            select: {
              id: true,
              name: true,
              season: true,
              slug: true,
            },
          },
          homeTeam: {
            select: {
              id: true,
              name: true,
            },
          },
          awayTeam: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!referee || referee.role !== UserRole.REFEREE) {
    return notFound();
  }

  const [profile, sourceLead, recentSmsDispatches] = await Promise.all([
    getRefereeProfileByUserId(referee.id),
    referee.createdFromLeadId
      ? prisma.interestLead.findUnique({
          where: { id: referee.createdFromLeadId },
          select: {
            id: true,
            contactName: true,
            email: true,
            phone: true,
            area: true,
            message: true,
            createdAt: true,
            convertedAt: true,
          },
        })
      : null,
    prisma.notificationDispatch.findMany({
      where: {
        sourceType: "REFEREE",
        sourceId: referee.id,
        channel: NotificationChannel.SMS,
      },
      orderBy: [{ createdAt: "desc" }],
      take: 8,
      select: {
        id: true,
        status: true,
        bodyText: true,
        scheduledFor: true,
        sentAt: true,
        failedAt: true,
        failureReason: true,
        createdAt: true,
      },
    }),
  ]);

  const scheduledFixtures = referee.refereedFixtures.filter(
    (fixture) => fixture.status === "SCHEDULED",
  );
  const completedFixtures = referee.refereedFixtures.filter(
    (fixture) => fixture.status === "COMPLETED",
  );
  const contactPhone = profile?.phone || sourceLead?.phone || "";
  const profileIsActive = profile?.isActive ?? true;
  const feePounds = formatPenceAsPoundsInput(profile?.standardNightFeePence);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <Link
            href="/admin/referees"
            className="text-sm font-medium text-emerald-300 transition hover:text-emerald-200"
          >
            ← Back to referees
          </Link>

          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl border border-emerald-500/20 bg-emerald-500/10 text-lg font-black text-emerald-300">
              {getInitials(referee.name, referee.email)}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-black tracking-tight text-white">
                  {referee.name?.trim() || "Unnamed referee"}
                </h1>

                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300">
                  Referee
                </span>
                <span className={["rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em]", profileIsActive ? "border-sky-400/20 bg-sky-400/10 text-sky-200" : "border-red-400/20 bg-red-400/10 text-red-200"].join(" ")}>
                  {profileIsActive ? "Active" : "Inactive"}
                </span>
              </div>

              <div className="mt-2 space-y-1 text-sm text-white/65">
                <div>{referee.email || "No email address"}</div>
                <div>{contactPhone || "No mobile number"}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <a
            href="#sms"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-sky-300 px-4 text-sm font-semibold text-black transition hover:bg-sky-200"
          >
            Send SMS
          </a>
          <Link
            href="/admin/fixtures"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-white transition hover:bg-white/10"
          >
            Manage fixtures
          </Link>

          {sourceLead ? (
            <Link
              href={`/admin/leads/${sourceLead.id}`}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-black transition hover:bg-emerald-400"
            >
              Open source lead
            </Link>
          ) : null}
        </div>
      </div>

      {updatedMessage || smsMessage ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
          {updatedMessage ?? smsMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">Total fixtures</div>
          <div className="mt-2 text-3xl font-black text-white">{referee.refereedFixtures.length}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">Scheduled</div>
          <div className="mt-2 text-3xl font-black text-white">{scheduledFixtures.length}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">Completed</div>
          <div className="mt-2 text-3xl font-black text-white">{completedFixtures.length}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">Night fee</div>
          <div className="mt-2 text-3xl font-black text-white">{formatMoney(profile?.standardNightFeePence)}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">SMS</div>
          <div className="mt-2 text-sm font-semibold text-white">{contactPhone ? "Ready" : "Needs phone"}</div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(380px,0.9fr)]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-5 sm:p-6">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-100/70">Edit referee</div>
            <h2 className="mt-2 text-xl font-bold text-white">Contact, fee and status</h2>
            <p className="mt-2 text-sm leading-6 text-emerald-50/70">
              This controls the referee details used by admin, SMS, assignments and future referee night cashups.
            </p>

            <form action={updateRefereeAction} className="mt-5 grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="refereeId" value={referee.id} />
              <label className="block">
                <span className="text-sm font-semibold text-white">Name</span>
                <input
                  name="name"
                  required
                  defaultValue={referee.name ?? ""}
                  className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/35 px-4 text-sm text-white outline-none placeholder:text-white/35"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-white">Email</span>
                <input
                  name="email"
                  type="email"
                  required
                  defaultValue={referee.email ?? ""}
                  className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/35 px-4 text-sm text-white outline-none placeholder:text-white/35"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-white">Mobile for SMS</span>
                <input
                  name="phone"
                  defaultValue={contactPhone}
                  placeholder="07700 900123"
                  className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/35 px-4 text-sm text-white outline-none placeholder:text-white/35"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-white">Area</span>
                <input
                  name="area"
                  defaultValue={sourceLead?.area ?? ""}
                  placeholder="Harrogate"
                  className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/35 px-4 text-sm text-white outline-none placeholder:text-white/35"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-white">Standard night fee</span>
                <div className="mt-2 flex h-12 items-center overflow-hidden rounded-2xl border border-white/10 bg-black/35">
                  <span className="px-4 text-sm font-semibold text-white/55">£</span>
                  <input
                    name="standardNightFee"
                    inputMode="decimal"
                    defaultValue={feePounds}
                    placeholder="45"
                    className="h-full w-full bg-transparent px-2 text-sm text-white outline-none placeholder:text-white/35"
                  />
                </div>
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
                <input
                  type="checkbox"
                  name="isActive"
                  defaultChecked={profileIsActive}
                  className="h-5 w-5 rounded border-white/20 bg-black text-emerald-400"
                />
                <span>
                  <span className="block text-sm font-semibold text-white">Active referee</span>
                  <span className="block text-xs text-white/50">Use this to mark someone unavailable without deleting them.</span>
                </span>
              </label>
              <label className="block sm:col-span-2">
                <span className="text-sm font-semibold text-white">Admin notes</span>
                <textarea
                  name="notes"
                  rows={4}
                  defaultValue={profile?.notes ?? ""}
                  placeholder="Availability, payment notes, preferences, reliability notes..."
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
                />
              </label>
              <div className="sm:col-span-2">
                <button type="submit" className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-5 text-sm font-bold text-black transition hover:bg-emerald-300">
                  Save referee
                </button>
              </div>
            </form>
          </section>

          <section id="sms" className="scroll-mt-28 rounded-3xl border border-sky-400/20 bg-sky-400/10 p-5 sm:p-6">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-100/70">SMS via SIXFL</div>
            <h2 className="mt-2 text-xl font-bold text-white">Send referee SMS</h2>
            <p className="mt-2 text-sm leading-6 text-sky-50/70">
              This queues an SMS through the existing SIXFL notification system, records it in messaging and respects SMS opt-out/suppression rules.
            </p>

            <form action={sendRefereeSmsAction} className="mt-5 space-y-4">
              <input type="hidden" name="refereeId" value={referee.id} />
              <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/70">
                <span className="font-semibold text-white">To:</span> {referee.name || referee.email || "Referee"} {contactPhone ? `· ${contactPhone}` : "· no mobile saved"}
              </div>
              <label className="block">
                <span className="text-sm font-semibold text-white">Message</span>
                <textarea
                  name="body"
                  required
                  rows={5}
                  placeholder="Hi, are you available to referee on Tuesday night?"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
                />
              </label>
              <button type="submit" className="inline-flex h-12 items-center justify-center rounded-2xl bg-sky-300 px-5 text-sm font-bold text-black transition hover:bg-sky-200">
                Queue SMS via SIXFL
              </button>
            </form>

            <div className="mt-6">
              <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-white/45">Recent referee SMS</h3>
              {recentSmsDispatches.length === 0 ? (
                <p className="mt-3 text-sm text-white/55">No SMS messages have been queued for this referee yet.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {recentSmsDispatches.map((dispatch) => (
                    <div key={dispatch.id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">
                          {dispatch.status}
                        </span>
                        <span className="text-xs text-white/45">Queued {formatDate(dispatch.createdAt)}</span>
                        {dispatch.sentAt ? <span className="text-xs text-emerald-200">Sent {formatDate(dispatch.sentAt)}</span> : null}
                        {dispatch.failedAt ? <span className="text-xs text-red-200">Failed {formatDate(dispatch.failedAt)}</span> : null}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-white/68">{getSmsPreview(dispatch.bodyText)}</p>
                      {dispatch.failureReason ? <p className="mt-2 text-xs text-red-200">{dispatch.failureReason}</p> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-black/25 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">Fixture assignments</div>
                <h2 className="mt-2 text-xl font-bold text-white">Referee fixture history</h2>
              </div>

              <Link href="/admin/fixtures" className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-white transition hover:bg-white/10">
                Open fixtures
              </Link>
            </div>

            {referee.refereedFixtures.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-5">
                <div className="text-sm font-semibold text-white">No fixtures assigned</div>
                <p className="mt-2 text-sm leading-6 text-white/60">This referee exists in the live assignment pool but has not yet been attached to any fixture.</p>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {referee.refereedFixtures.map((fixture) => (
                  <div key={fixture.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">
                        {formatStatus(fixture.status)}
                      </span>
                      {fixture.league ? (
                        <span className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">
                          {fixture.league.name}{fixture.league.season ? ` • ${fixture.league.season}` : ""}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 text-lg font-bold text-white">{fixture.homeTeam?.name || "Home"} v {fixture.awayTeam?.name || "Away"}</div>
                    <div className="mt-2 text-sm text-white/60">{formatDate(fixture.kickoffAt)}</div>
                    {fixture.league?.slug ? (
                      <div className="mt-4">
                        <Link href={`/leagues/${fixture.league.slug}/fixtures`} className="text-sm font-medium text-emerald-300 transition hover:text-emerald-200">
                          View public league fixtures →
                        </Link>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.12),transparent_38%),rgba(255,255,255,0.03)] p-5 sm:p-6">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300/80">Referee profile</div>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Name</div><div className="mt-2 text-sm font-semibold text-white">{referee.name || "—"}</div></div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Email</div><div className="mt-2 text-sm font-semibold text-white">{referee.email || "—"}</div></div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Mobile</div><div className="mt-2 text-sm font-semibold text-white">{contactPhone || "—"}</div></div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Standard night fee</div><div className="mt-2 text-sm font-semibold text-white">{formatMoney(profile?.standardNightFeePence)}</div></div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Status</div><div className="mt-2 text-sm font-semibold text-white">{profileIsActive ? "Active" : "Inactive"}</div></div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Created from lead</div><div className="mt-2 text-sm font-semibold text-white">{sourceLead ? "Yes" : "No"}</div></div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Converted</div><div className="mt-2 text-sm font-semibold text-white">{sourceLead?.convertedAt ? formatDate(sourceLead.convertedAt) : "—"}</div></div>
              {profile?.notes ? <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Admin notes</div><div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/75">{profile.notes}</div></div> : null}
            </div>
          </div>

          {sourceLead ? (
            <div className="rounded-3xl border border-white/10 bg-black/25 p-5 sm:p-6">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">Source lead</div>
              <h2 className="mt-2 text-xl font-bold text-white">Original referee interest</h2>
              <div className="mt-4 grid gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Contact name</div><div className="mt-2 text-sm font-semibold text-white">{sourceLead.contactName || "—"}</div></div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Phone</div><div className="mt-2 text-sm font-semibold text-white">{sourceLead.phone || "—"}</div></div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Area</div><div className="mt-2 text-sm font-semibold text-white">{sourceLead.area || "—"}</div></div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Notes</div><div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/75">{sourceLead.message || "—"}</div></div>
              </div>
              <div className="mt-5">
                <Link href={`/admin/leads/${sourceLead.id}`} className="inline-flex h-11 items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-black transition hover:bg-emerald-400">
                  Open lead
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
