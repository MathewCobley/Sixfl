// ========================================
// File: src/app/captain/team/[teamid]/squad/[membershipId]/edit/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";
import { updateManagedSquadMemberDetailsAction } from "../../edit-actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Edit Squad Player | SIXFL",
};

function formatPreferredNights(value: unknown) {
  if (!value) return "";

  if (Array.isArray(value)) {
    return value.filter(Boolean).join(", ");
  }

  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .flat()
      .filter(Boolean)
      .map(String)
      .join(", ");
  }

  return String(value);
}

function formatFeeOverride(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return (value / 100).toFixed(2);
}

function getInitials(name: string | null | undefined, email: string | null | undefined) {
  const base = (name || email || "?").trim();
  const parts = base.split(/\s+/).filter(Boolean).slice(0, 2);

  if (!parts.length) return "?";

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  placeholder,
  help,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  type?: string;
  placeholder?: string;
  help?: string;
}) {
  return (
    <label className="space-y-2 text-sm font-medium text-white/65">
      <span>{label}</span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400/50 focus:bg-black/35"
      />
      {help ? <span className="block text-xs font-normal text-white/40">{help}</span> : null}
    </label>
  );
}

function TextArea({
  label,
  name,
  defaultValue,
  placeholder,
  rows = 4,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="space-y-2 text-sm font-medium text-white/65">
      <span>{label}</span>
      <textarea
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400/50 focus:bg-black/35"
      />
    </label>
  );
}

function WhatsAppToggle({ defaultChecked }: { defaultChecked: boolean }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 transition hover:border-emerald-400/30 hover:bg-emerald-500/[0.06] md:col-span-2">
      <span className="flex min-w-0 items-center gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10">
          <img src="/WhatsApp-Logo.png" alt="" className="h-6 w-6 object-contain" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-white">Player uses WhatsApp</span>
          <span className="mt-1 block text-xs font-normal leading-5 text-white/45">
            Tick this when the player uses WhatsApp, so captains know payment links can be sent that way.
          </span>
        </span>
      </span>

      <span className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-white/10 bg-black/40 p-0.5">
        <input
          type="checkbox"
          name="usesWhatsapp"
          defaultChecked={defaultChecked}
          className="peer sr-only"
        />
        <span className="h-5 w-5 rounded-full bg-white/45 transition peer-checked:translate-x-5 peer-checked:bg-emerald-300" />
      </span>
    </label>
  );
}

export default async function EditSquadPlayerPage({
  params,
}: {
  params: Promise<{ teamid: string; membershipId: string }>;
}) {
  const { teamid, membershipId } = await params;
  const access = await requireCaptain(teamid);

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      name: true,
      teamMode: true,
      league: {
        select: {
          name: true,
          season: true,
        },
      },
    },
  });

  if (!team) notFound();

  const membership = await prisma.teamMember.findFirst({
    where: {
      id: membershipId,
      teamId: teamid,
    },
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!membership) notFound();

  const whatsappRows = await prisma.$queryRaw<Array<{ usesWhatsapp: boolean }>>`
    SELECT "usesWhatsapp"
    FROM "User"
    WHERE id = ${membership.user.id}
    LIMIT 1
  `;

  const usesWhatsapp = Boolean(whatsappRows[0]?.usesWhatsapp);

  const profiles = await getTeamMemberProfilesByTeamMemberIds([membership.id]);
  const profile = profiles.get(membership.id) ?? null;
  const preferredNights = formatPreferredNights(profile?.preferredNights);

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1fr_auto] lg:px-8 lg:py-8">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-base font-black text-white/75">
              {getInitials(membership.user.name, membership.user.email)}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
                Squad player
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Edit {membership.user.name || "player"}
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-white/65 sm:text-base">
                Update this player’s contact details, availability notes and payment settings for your team.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                  {team.name}
                </span>
                {team.league ? (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                    {team.league.name}{team.league.season ? ` · ${team.league.season}` : ""}
                  </span>
                ) : null}
                <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-100">
                  {team.teamMode === "MANAGED" ? "SIXFL-managed" : "Standard team"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 lg:justify-end">
            <Link
              href={`/captain/team/${teamid}/squad`}
              className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
            >
              Back to squad
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] lg:p-8">
        <form action={updateManagedSquadMemberDetailsAction} className="space-y-7">
          <input type="hidden" name="teamid" value={teamid} />
          <input type="hidden" name="membershipId" value={membership.id} />

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Contact details
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field
                label="Player name"
                name="displayName"
                defaultValue={membership.user.name}
                placeholder="Player name"
              />
              <Field
                label="Email"
                name="email"
                type="email"
                defaultValue={membership.user.email}
                placeholder="player@example.com"
              />
              <Field
                label="Phone"
                name="phone"
                defaultValue={profile?.phone}
                placeholder="Mobile number"
              />
              <WhatsAppToggle defaultChecked={usesWhatsapp} />
            </div>
          </div>

          {access.isAdmin ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Match fee setting · Admin only
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field
                  label="Player fee override"
                  name="playerMatchFeeOverride"
                  type="number"
                  defaultValue={formatFeeOverride(profile?.playerMatchFeePenceOverride)}
                  placeholder="Leave blank to use the team default"
                  help="Admin-only setting. Use 0 for a free player. Every change is recorded in the audit log."
                />
              </div>
            </div>
          ) : null}

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Football profile
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field
                label="Preferred positions"
                name="preferredPositions"
                defaultValue={profile?.preferredPositions}
                placeholder="Defender, midfield, striker..."
              />
              <Field
                label="Experience"
                name="experienceSummary"
                defaultValue={profile?.experienceSummary}
                placeholder="Casual, league player, experienced..."
              />
              <Field
                label="Availability level"
                name="availabilityLevel"
                defaultValue={profile?.availabilityLevel}
                placeholder="Regular, rotation, backup..."
              />
              <Field
                label="Preferred nights"
                name="preferredNights"
                defaultValue={preferredNights}
                placeholder="Tuesday, Thursday"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <TextArea
              label="Availability notes"
              name="availabilitySummary"
              defaultValue={profile?.availabilitySummary}
              placeholder="Any notes about when this player can usually play."
            />
            <TextArea
              label="Player notes"
              name="notes"
              defaultValue={profile?.notes}
              placeholder="Team notes for this player."
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.04] p-4">
            <div>
              <div className="text-sm font-semibold text-white">Save player details</div>
              <div className="mt-1 text-xs text-white/45">
                These details help captains send payment links and organise matchday squads.
              </div>
            </div>
            <button
              type="submit"
              className="inline-flex items-center rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400"
            >
              Save player
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
