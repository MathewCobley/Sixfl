// ========================================
// File: src/app/captain/team/[teamid]/kit/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";

import TeamKitOrderForm from "@/components/captain/TeamKitOrderForm";
import {
  TEAM_KIT_QUANTITY,
  TEAM_KIT_SIZE_GUIDE,
  getTeamKitStatusLabel,
} from "@/lib/kits/constants";
import { getTeamKitOrder, listKitDesigns } from "@/lib/kits/db";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { saveTeamKitOrderAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Team Kit | SIXFL Captain",
};

type SearchParams = {
  saved?: string;
  submitted?: string;
  error?: string;
};

function errorMessage(error: string | undefined) {
  if (!error) return null;
  if (error === "order_locked") {
    return "This order has already been submitted. Ask SIXFL to reopen it before making changes.";
  }
  if (error === "choose_design") return "Choose a kit design before saving.";
  if (error === "design_unavailable") {
    return "That kit design is no longer available. Please choose another design.";
  }
  if (error === "duplicate_numbers") {
    return "Each of the nine shirts needs a different shirt number.";
  }
  if (error === "save_failed") {
    return "The kit order could not be saved. Please check the details and try again.";
  }

  const kitSizeMatch = error.match(/^missing_kit_size_(\d+)$/);
  if (kitSizeMatch) return `Choose a kit size for kit ${kitSizeMatch[1]}.`;

  const sockSizeMatch = error.match(/^missing_sock_size_(\d+)$/);
  if (sockSizeMatch) return `Choose a sock size for kit ${sockSizeMatch[1]}.`;

  const numberMatch = error.match(/^invalid_number_(\d+)$/);
  if (numberMatch) return `Enter a shirt number from 1 to 99 for kit ${numberMatch[1]}.`;

  return "Please check the kit order and try again.";
}

function statusClasses(status: string) {
  switch (status) {
    case "DRAFT":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    case "SUBMITTED":
      return "border-sky-400/25 bg-sky-500/10 text-sky-100";
    case "APPROVED":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "ORDERED":
      return "border-violet-400/25 bg-violet-500/10 text-violet-100";
    case "FULFILLED":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    default:
      return "border-red-400/25 bg-red-500/10 text-red-100";
  }
}

export default async function CaptainTeamKitPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamid: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { teamid } = await params;
  const sp = (await searchParams) ?? {};
  const access = await requireCaptain(teamid);

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      name: true,
      league: {
        select: {
          name: true,
          season: true,
        },
      },
    },
  });

  if (!team) notFound();

  const [allDesigns, order] = await Promise.all([
    listKitDesigns({ includeInactive: true }),
    getTeamKitOrder(teamid),
  ]);

  const selectedDesignId = order?.kitDesignId ?? null;
  const designs = allDesigns.filter(
    (design) => design.isActive || design.id === selectedDesignId,
  );
  const locked = Boolean(order && order.status !== "DRAFT");
  const error = errorMessage(sp.error);

  async function saveAction(formData: FormData) {
    "use server";
    formData.set("teamId", teamid);
    await saveTeamKitOrderAction(formData);
  }

  return (
    <div className="space-y-8 pb-12">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/20 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.34)] sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">
              Team kit order
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Choose {team.name}&apos;s kit
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60 sm:text-base">
              Your team receives {TEAM_KIT_QUANTITY} complete kits. Choose one design,
              then enter the kit size, sock size, back name and shirt number for each player.
            </p>
            {team.league ? (
              <p className="mt-3 text-sm text-white/40">
                {team.league.name}
                {team.league.season ? ` · ${team.league.season}` : ""}
              </p>
            ) : null}
          </div>

          <span
            className={[
              "inline-flex w-fit rounded-full border px-4 py-2 text-sm font-semibold",
              statusClasses(order?.status ?? "DRAFT"),
            ].join(" ")}
          >
            {order ? getTeamKitStatusLabel(order.status) : "Not started"}
          </span>
        </div>
      </section>

      {sp.saved === "1" ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          Draft saved. You can return and finish it later.
        </div>
      ) : null}

      {sp.submitted === "1" ? (
        <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
          Your nine-kit order has been submitted to SIXFL. It is now locked while we review it.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {locked ? (
        <section className="rounded-3xl border border-sky-400/20 bg-sky-500/[0.07] p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-white">Order submitted</h2>
          <p className="mt-2 text-sm leading-6 text-white/55">
            The details below are read-only while SIXFL checks and places the order.
            Contact us if anything needs changing.
          </p>
        </section>
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Men&apos;s kit size guide</h2>
            <p className="mt-2 text-sm text-white/50">
              Use the supplier measurements below. The selected kit size covers the shirt and shorts.
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs text-white/50">
            Socks: Medium 6–8 · Large 8+
          </div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full divide-y divide-white/10 text-left text-sm">
            <thead className="bg-black/25 text-white/45">
              <tr>
                <th className="px-4 py-3 font-semibold">Size</th>
                <th className="px-4 py-3 font-semibold">Length</th>
                <th className="px-4 py-3 font-semibold">Chest</th>
                <th className="px-4 py-3 font-semibold">Recommended height</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {TEAM_KIT_SIZE_GUIDE.map((row) => (
                <tr key={row.size} className="text-white/70">
                  <td className="px-4 py-3 font-semibold text-white">{row.size}</td>
                  <td className="px-4 py-3">{row.lengthCm} cm</td>
                  <td className="px-4 py-3">{row.chestCm} cm</td>
                  <td className="px-4 py-3">{row.heightCm} cm</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {designs.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-10 text-center">
          <h2 className="text-xl font-semibold text-white">Kit designs are being added</h2>
          <p className="mt-2 text-sm leading-6 text-white/50">
            SIXFL has not published the shirt catalogue yet. Please check back shortly.
          </p>
          {access.isAdmin ? (
            <Link
              href="/admin/kits"
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl bg-emerald-400 px-4 text-sm font-semibold text-black"
            >
              Upload kit designs
            </Link>
          ) : null}
        </section>
      ) : (
        <TeamKitOrderForm
          designs={designs.map((design) => ({
            id: design.id,
            code: design.code,
            name: design.name,
            primaryColour: design.primaryColour,
            secondaryColour: design.secondaryColour,
            style: design.style,
            updatedAtIso: design.updatedAt.toISOString(),
          }))}
          initialDesignId={selectedDesignId}
          initialItems={order?.items ?? []}
          initialCaptainNotes={order?.captainNotes ?? null}
          locked={locked}
          action={saveAction}
        />
      )}
    </div>
  );
}
