// ========================================
// File: src/app/admin/venues/page.tsx
// ========================================

import type { ReactNode } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import VenueForm from "@/components/admin/venues/VenueForm";
import { deleteVenueAction, updateVenueAction } from "./actions";

const adminInputClassName =
  "h-12 w-full rounded-2xl border border-white/10 bg-black/35 px-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20";

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <div className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;

  return (
    <p>
      <span className="font-semibold text-white/70">{label}: </span>
      {value}
    </p>
  );
}

function VenueLinkButton({
  href,
  children,
}: {
  href?: string | null;
  children: ReactNode;
}) {
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-semibold text-white transition hover:border-emerald-400/30 hover:bg-emerald-400/10 hover:text-emerald-100"
    >
      {children}
    </a>
  );
}

function EditField({
  label,
  name,
  defaultValue,
  placeholder,
  className,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder: string;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
        {label}
      </span>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className={adminInputClassName}
      />
    </label>
  );
}

export default async function AdminVenuesPage({
  searchParams,
}: {
  searchParams?: Promise<{
    deleted?: string;
    updated?: string;
    error?: string;
  }>;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};

  const venues = await prisma.venue.findMany({
    orderBy: [{ name: "asc" }],
    include: {
      _count: {
        select: {
          fixtures: true,
        },
      },
    },
  });

  const totalFixturesUsingVenues = venues.reduce(
    (sum, venue) => sum + venue._count.fixtures,
    0
  );

  const venuesWithImages = venues.filter((venue) => venue.imageUrl).length;
  const venuesWithDirections = venues.filter((venue) => venue.googleMapsUrl).length;

  const errorMessage =
    sp.error === "in-use"
      ? "That venue cannot be deleted because fixtures are already linked to it."
      : sp.error === "missing-id"
        ? "No venue ID was provided."
        : sp.error === "missing-name"
          ? "Venue name is required before a venue can be updated."
          : null;

  const deleted = sp.deleted === "1";
  const updated = sp.updated === "1";

  return (
    <div className="w-full px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <div className="space-y-8">
        <div className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_32%),rgba(255,255,255,0.03)] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] md:p-8">
          <div className="flex flex-col gap-6 2xl:flex-row 2xl:items-end 2xl:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
                Venue management
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
                  Manage SIXFL venues
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60 md:text-base">
                  Add match locations once, then reuse them across league setup,
                  manual fixture creation, fixture generation, and public launch
                  pages.
                </p>
              </div>
            </div>

            <div className="grid w-full gap-3 sm:grid-cols-2 lg:max-w-[680px] lg:grid-cols-4">
              <MetricCard label="Venues" value={venues.length} />
              <MetricCard label="Linked fixtures" value={totalFixturesUsingVenues} />
              <MetricCard label="Images added" value={venuesWithImages} />
              <MetricCard label="Map links" value={venuesWithDirections} />
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {errorMessage}
          </div>
        )}

        {deleted && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            Venue deleted successfully.
          </div>
        )}

        {updated && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            Venue updated successfully.
          </div>
        )}

        <div className="grid gap-8 2xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
            <div className="border-b border-white/10 px-6 py-6 md:px-8">
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
                  New venue
                </div>
                <h2 className="text-2xl font-semibold tracking-tight text-white">
                  Create venue
                </h2>
                <p className="max-w-2xl text-sm leading-6 text-white/60">
                  Add the core details, public image, directions and facilities so
                  each venue can support league recruitment as well as fixtures.
                </p>
              </div>
            </div>

            <div className="px-6 py-6 md:px-8">
              <VenueForm />
            </div>
          </section>

          <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
            <div className="border-b border-white/10 px-6 py-6 md:px-8">
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
                  Venue library
                </div>
                <h2 className="text-2xl font-semibold tracking-tight text-white">
                  Existing venues
                </h2>
                <p className="max-w-2xl text-sm leading-6 text-white/60">
                  Review venue usage, public images, directions and captain-facing
                  details before using a venue for a new league launch.
                </p>
              </div>
            </div>

            {venues.length === 0 ? (
              <div className="px-6 py-10 md:px-8">
                <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 px-6 py-12 text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/60">
                    📍
                  </div>
                  <h3 className="text-lg font-semibold text-white">
                    No venues yet
                  </h3>
                  <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/50">
                    Create your first venue to make fixture setup cleaner and more
                    reusable.
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {venues.map((venue) => (
                  <div key={venue.id} className="px-6 py-5 md:px-8">
                    <div className="grid gap-5 xl:grid-cols-[180px_minmax(0,1fr)]">
                      {venue.imageUrl ? (
                        <div
                          className="min-h-36 overflow-hidden rounded-3xl border border-white/10 bg-cover bg-center bg-no-repeat shadow-[inset_0_-50px_90px_rgba(0,0,0,0.55)] xl:min-h-32"
                          style={{
                            backgroundImage: `linear-gradient(to top, rgba(0,0,0,0.48), rgba(0,0,0,0.05)), url(${JSON.stringify(
                              venue.imageUrl
                            )})`,
                          }}
                          aria-label={`${venue.name} image preview`}
                        />
                      ) : (
                        <div className="flex min-h-36 items-center justify-center rounded-3xl border border-dashed border-white/10 bg-black/25 text-sm font-semibold text-white/35 xl:min-h-32">
                          No image
                        </div>
                      )}

                      <div className="min-w-0 space-y-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-semibold text-white">
                                {venue.name}
                              </h3>
                              <span className="inline-flex rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold text-white/70">
                                {venue._count.fixtures} fixture
                                {venue._count.fixtures === 1 ? "" : "s"}
                              </span>
                            </div>

                            <div className="space-y-1 text-sm leading-6 text-white/55">
                              <DetailLine label="Address" value={venue.address} />
                              <DetailLine label="Postcode" value={venue.postcode} />
                              <DetailLine label="Notes" value={venue.notes} />
                              <DetailLine label="Parking" value={venue.parkingNotes} />
                              <DetailLine label="Pitch" value={venue.pitchNotes} />
                              <DetailLine label="Facilities" value={venue.facilities} />

                              {!venue.address &&
                              !venue.postcode &&
                              !venue.notes &&
                              !venue.parkingNotes &&
                              !venue.pitchNotes &&
                              !venue.facilities ? (
                                <p className="text-white/35">
                                  No extra venue details added.
                                </p>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex shrink-0 flex-wrap items-center gap-3 lg:justify-end">
                            <VenueLinkButton href={venue.googleMapsUrl}>
                              Map
                            </VenueLinkButton>
                            <VenueLinkButton href={venue.websiteUrl}>
                              Website
                            </VenueLinkButton>

                            <Link
                              href="/admin/fixtures"
                              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08]"
                            >
                              Use in fixtures
                            </Link>

                            <form action={deleteVenueAction}>
                              <input type="hidden" name="id" value={venue.id} />
                              <button
                                type="submit"
                                disabled={venue._count.fixtures > 0}
                                className="inline-flex h-10 items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 text-sm font-semibold text-rose-200 transition hover:border-rose-400/30 hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Delete
                              </button>
                            </form>
                          </div>
                        </div>

                        {(venue.imageUrl || venue.websiteUrl || venue.googleMapsUrl) && (
                          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-5 text-white/40">
                            {venue.imageUrl ? (
                              <p className="truncate">
                                <span className="font-semibold text-white/55">Image:</span>{" "}
                                {venue.imageUrl}
                              </p>
                            ) : null}
                            {venue.googleMapsUrl ? (
                              <p className="truncate">
                                <span className="font-semibold text-white/55">Map:</span>{" "}
                                {venue.googleMapsUrl}
                              </p>
                            ) : null}
                            {venue.websiteUrl ? (
                              <p className="truncate">
                                <span className="font-semibold text-white/55">Website:</span>{" "}
                                {venue.websiteUrl}
                              </p>
                            ) : null}
                          </div>
                        )}

                        <details className="group rounded-2xl border border-white/10 bg-black/20">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-white marker:hidden">
                            <span>Edit venue details</span>
                            <span className="text-xs uppercase tracking-[0.16em] text-emerald-300/80 group-open:hidden">
                              Open
                            </span>
                            <span className="hidden text-xs uppercase tracking-[0.16em] text-emerald-300/80 group-open:inline">
                              Close
                            </span>
                          </summary>

                          <form
                            action={updateVenueAction}
                            className="border-t border-white/10 p-4"
                          >
                            <input type="hidden" name="id" value={venue.id} />

                            <div className="grid gap-4 lg:grid-cols-2">
                              <EditField
                                label="Venue name"
                                name="name"
                                defaultValue={venue.name}
                                placeholder="e.g. Northallerton Leisure Centre"
                                className="lg:col-span-2"
                              />
                              <EditField
                                label="Address"
                                name="address"
                                defaultValue={venue.address}
                                placeholder="e.g. Rotary Way, Brompton, Northallerton"
                                className="lg:col-span-2"
                              />
                              <EditField
                                label="Postcode"
                                name="postcode"
                                defaultValue={venue.postcode}
                                placeholder="e.g. DL6 2UZ"
                              />
                              <EditField
                                label="Notes"
                                name="notes"
                                defaultValue={venue.notes}
                                placeholder="e.g. Wednesday league venue"
                              />
                              <EditField
                                label="Image URL"
                                name="imageUrl"
                                defaultValue={venue.imageUrl}
                                placeholder="https://www.sixfl.co.uk/venues/northallerton-leisure-centre.jpg"
                                className="lg:col-span-2"
                              />
                              <EditField
                                label="Website URL"
                                name="websiteUrl"
                                defaultValue={venue.websiteUrl}
                                placeholder="https://..."
                              />
                              <EditField
                                label="Google Maps URL"
                                name="googleMapsUrl"
                                defaultValue={venue.googleMapsUrl}
                                placeholder="https://maps.google.com/..."
                              />
                              <EditField
                                label="Parking notes"
                                name="parkingNotes"
                                defaultValue={venue.parkingNotes}
                                placeholder="e.g. Free parking available on site"
                                className="lg:col-span-2"
                              />
                              <EditField
                                label="Pitch notes"
                                name="pitchNotes"
                                defaultValue={venue.pitchNotes}
                                placeholder="e.g. 3G pitch, moulded boots recommended"
                              />
                              <EditField
                                label="Facilities"
                                name="facilities"
                                defaultValue={venue.facilities}
                                placeholder="e.g. Changing rooms, toilets, floodlights"
                              />
                            </div>

                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                              <p className="text-xs leading-5 text-white/40">
                                Updating these details affects admin venue previews and
                                future public league venue sections.
                              </p>
                              <button
                                type="submit"
                                className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-black transition hover:bg-emerald-300"
                              >
                                Save venue
                              </button>
                            </div>
                          </form>
                        </details>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
