type Design = {
  id: string;
  code: string;
  name: string | null;
  primaryColour: string | null;
  secondaryColour: string | null;
  style: string | null;
  updatedAtIso: string;
};

type Props = {
  teamName: string;
  designs: Design[];
  selectedDesignId: string | null;
  action: (formData: FormData) => Promise<void>;
};

export default function TeamKitDesignPreferencePicker({
  teamName,
  designs,
  selectedDesignId,
  action,
}: Props) {
  const selectedDesign =
    designs.find((design) => design.id === selectedDesignId) ?? null;

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
      <div className="border-b border-white/10 px-5 py-5 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/75">
          Team kit
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-white">
          Choose {teamName}&apos;s kit
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
          Choose the team design now. Player personalisation boxes are added as kit payments are completed.
        </p>
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
                Team design selected
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

      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:p-6 lg:grid-cols-5 xl:grid-cols-6">
        {designs.map((design) => {
          const selected = design.id === selectedDesignId;
          return (
            <form key={design.id} action={action}>
              <button
                type="submit"
                name="kitDesignId"
                value={design.id}
                aria-pressed={selected}
                className={[
                  "group w-full overflow-hidden rounded-2xl border p-2 text-left transition",
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
                    {selected ? "Selected" : design.name ?? "Team kit"}
                  </div>
                </div>
              </button>
            </form>
          );
        })}
      </div>
    </section>
  );
}
