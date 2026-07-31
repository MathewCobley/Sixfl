// ========================================
// File: src/components/captain/TeamKitOrderForm.tsx
// ========================================

"use client";

import { useMemo, useState } from "react";

import FormListboxField from "@/components/ui/FormListboxField";
import {
  TEAM_KIT_QUANTITY,
  TEAM_KIT_SIZE_OPTIONS,
  TEAM_KIT_SOCK_SIZE_OPTIONS,
  getTeamKitSizeLabel,
  getTeamKitSockSizeLabel,
  type TeamKitSize,
  type TeamKitSockSize,
} from "@/lib/kits/constants";

type Design = {
  id: string;
  code: string;
  name: string | null;
  primaryColour: string | null;
  secondaryColour: string | null;
  style: string | null;
  updatedAtIso: string;
};

type InitialItem = {
  position: number;
  backName: string | null;
  shirtNumber: number;
  kitSize: TeamKitSize;
  sockSize: TeamKitSockSize;
};

type Row = {
  position: number;
  backName: string;
  shirtNumber: string;
  kitSize: TeamKitSize | "";
  sockSize: TeamKitSockSize | "";
};

type Props = {
  designs: Design[];
  initialDesignId: string | null;
  initialItems: InitialItem[];
  initialCaptainNotes: string | null;
  locked: boolean;
  action: (formData: FormData) => Promise<void>;
};

const kitSizeOptions = TEAM_KIT_SIZE_OPTIONS.map((option) => ({ ...option }));
const sockSizeOptions = TEAM_KIT_SOCK_SIZE_OPTIONS.map((option) => ({ ...option }));

function buildInitialRows(items: InitialItem[]): Row[] {
  const itemByPosition = new Map(items.map((item) => [item.position, item]));

  return Array.from({ length: TEAM_KIT_QUANTITY }, (_, index) => {
    const position = index + 1;
    const item = itemByPosition.get(position);

    return {
      position,
      backName: item?.backName ?? "",
      shirtNumber: item ? String(item.shirtNumber) : "",
      kitSize: item?.kitSize ?? "",
      sockSize: item?.sockSize ?? "",
    };
  });
}

function countValues(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values.filter(Boolean)) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries());
}

export default function TeamKitOrderForm({
  designs,
  initialDesignId,
  initialItems,
  initialCaptainNotes,
  locked,
  action,
}: Props) {
  const [selectedDesignId, setSelectedDesignId] = useState(initialDesignId ?? "");
  const [rows, setRows] = useState<Row[]>(() => buildInitialRows(initialItems));
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const selectedDesign =
    designs.find((design) => design.id === selectedDesignId) ?? null;

  const filteredDesigns = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return designs;

    return designs.filter((design) =>
      [design.code, design.name, design.primaryColour, design.secondaryColour, design.style]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(query)),
    );
  }, [designs, search]);

  const visibleDesigns = showAll ? filteredDesigns : filteredDesigns.slice(0, 30);
  const kitSizeCounts = countValues(rows.map((row) => row.kitSize));
  const sockSizeCounts = countValues(rows.map((row) => row.sockSize));

  function updateRow(position: number, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.position === position ? { ...row, ...patch } : row)),
    );
  }

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="kitDesignId" value={selectedDesignId} />

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
        <div className="border-b border-white/10 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/75">
                Step 1
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Choose your team kit</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
                One design will be used for all nine kits. Search by supplier code, colour or style.
              </p>
            </div>

            {!locked ? (
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search kit code or colour"
                className="h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/15 lg:max-w-sm"
              />
            ) : null}
          </div>
        </div>

        {selectedDesign ? (
          <div className="border-b border-white/10 bg-emerald-500/[0.06] px-5 py-4 sm:px-6">
            <div className="flex items-center gap-4">
              <img
                src={`/api/kits/${selectedDesign.id}/image?size=thumb&v=${encodeURIComponent(
                  selectedDesign.updatedAtIso,
                )}`}
                alt={`${selectedDesign.name ?? selectedDesign.code} selected kit`}
                className="h-20 w-20 rounded-2xl border border-emerald-400/20 bg-white object-contain p-1"
              />
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300/70">
                  Selected design
                </div>
                <div className="mt-1 text-xl font-semibold text-white">
                  {selectedDesign.code}
                </div>
                <div className="mt-1 text-sm text-white/50">
                  {selectedDesign.name ?? "Team kit"}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {!locked ? (
          <div className="p-4 sm:p-6">
            {visibleDesigns.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-white/50">
                No kit designs match that search.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
                {visibleDesigns.map((design) => {
                  const selected = design.id === selectedDesignId;

                  return (
                    <button
                      key={design.id}
                      type="button"
                      onClick={() => setSelectedDesignId(design.id)}
                      aria-pressed={selected}
                      className={[
                        "group overflow-hidden rounded-2xl border p-2 text-left transition",
                        selected
                          ? "border-emerald-400/60 bg-emerald-500/15 ring-2 ring-emerald-400/20"
                          : "border-white/10 bg-black/20 hover:border-white/25 hover:bg-white/[0.05]",
                      ].join(" ")}
                    >
                      <div className="aspect-square overflow-hidden rounded-xl bg-white">
                        <img
                          src={`/api/kits/${design.id}/image?size=thumb&v=${encodeURIComponent(
                            design.updatedAtIso,
                          )}`}
                          alt={design.name ?? `Kit ${design.code}`}
                          loading="lazy"
                          className="h-full w-full object-contain p-1 transition group-hover:scale-[1.03]"
                        />
                      </div>
                      <div className="px-1 pb-1 pt-2">
                        <div className="truncate text-sm font-semibold text-white">
                          {design.code}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-white/40">
                          {design.name ?? "Team kit"}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {!showAll && filteredDesigns.length > visibleDesigns.length ? (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm font-semibold text-white/75 transition hover:bg-white/[0.08]"
              >
                Show all {filteredDesigns.length} designs
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
        <div className="border-b border-white/10 px-5 py-5 sm:px-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/75">
            Step 2
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Personalise all nine kits</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
            Enter one row per kit. Shirt numbers must be unique. Leave the back name blank when a player only wants a number printed.
          </p>
        </div>

        <div className="space-y-4 p-4 sm:p-6">
          {rows.map((row) => (
            <div
              key={row.position}
              className="rounded-3xl border border-white/10 bg-black/20 p-4 sm:p-5"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-white">
                  Kit {row.position} of {TEAM_KIT_QUANTITY}
                </div>
                <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/45">
                  Quantity 1
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="space-y-2">
                  <span className="block text-sm text-white/70">Name on back</span>
                  <input
                    name={`backName_${row.position}`}
                    type="text"
                    maxLength={18}
                    value={row.backName}
                    disabled={locked}
                    onChange={(event) =>
                      updateRow(row.position, {
                        backName: event.target.value.toUpperCase(),
                      })
                    }
                    placeholder="e.g. SMITH"
                    className="h-12 w-full rounded-xl border border-white/10 bg-[#0d1428] px-4 text-sm uppercase text-white outline-none placeholder:text-white/25 focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>

                <label className="space-y-2">
                  <span className="block text-sm text-white/70">Shirt number</span>
                  <input
                    name={`shirtNumber_${row.position}`}
                    type="number"
                    min={1}
                    max={99}
                    inputMode="numeric"
                    required
                    value={row.shirtNumber}
                    disabled={locked}
                    onChange={(event) =>
                      updateRow(row.position, { shirtNumber: event.target.value })
                    }
                    placeholder="1–99"
                    className="h-12 w-full rounded-xl border border-white/10 bg-[#0d1428] px-4 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>

                <FormListboxField
                  name={`kitSize_${row.position}`}
                  label="Kit size"
                  value={row.kitSize}
                  options={kitSizeOptions}
                  placeholder="Choose kit size"
                  disabled={locked}
                  onValueChange={(value) =>
                    updateRow(row.position, { kitSize: value as TeamKitSize })
                  }
                />

                <FormListboxField
                  name={`sockSize_${row.position}`}
                  label="Sock size"
                  value={row.sockSize}
                  options={sockSizeOptions}
                  placeholder="Choose sock size"
                  disabled={locked}
                  onValueChange={(value) =>
                    updateRow(row.position, { sockSize: value as TeamKitSockSize })
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div>
            <label className="block text-sm font-semibold text-white">Notes for SIXFL</label>
            <p className="mt-1 text-sm text-white/45">
              Add anything we need to know before ordering.
            </p>
            <textarea
              name="captainNotes"
              rows={5}
              maxLength={1000}
              defaultValue={initialCaptainNotes ?? ""}
              disabled={locked}
              className="mt-3 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/25 focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="Optional notes"
            />
          </div>

          <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.06] p-4">
            <div className="text-sm font-semibold text-white">Order summary</div>
            <div className="mt-3 text-sm text-white/60">
              Selected: <span className="font-semibold text-white">{selectedDesign?.code ?? "Not chosen"}</span>
            </div>

            <div className="mt-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
                Kit sizes
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {kitSizeCounts.length ? (
                  kitSizeCounts.map(([size, count]) => (
                    <span
                      key={size}
                      className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/70"
                    >
                      {getTeamKitSizeLabel(size as TeamKitSize)} × {count}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-white/35">No sizes selected yet</span>
                )}
              </div>
            </div>

            <div className="mt-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
                Socks
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {sockSizeCounts.length ? (
                  sockSizeCounts.map(([size, count]) => (
                    <span
                      key={size}
                      className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/70"
                    >
                      {getTeamKitSockSizeLabel(size as TeamKitSockSize)} × {count}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-white/35">No sock sizes selected yet</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {!locked ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="submit"
            name="intent"
            value="save"
            className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-5 text-sm font-semibold text-white/80 transition hover:bg-white/[0.08]"
          >
            Save draft
          </button>
          <button
            type="submit"
            name="intent"
            value="submit"
            className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300"
          >
            Submit all nine kits
          </button>
        </div>
      ) : null}
    </form>
  );
}
