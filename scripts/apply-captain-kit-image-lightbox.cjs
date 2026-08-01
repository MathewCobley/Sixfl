const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const formPath = "src/components/captain/TeamKitOrderForm.tsx";
const absolutePath = path.join(root, formPath);
let source = fs.readFileSync(absolutePath, "utf8");

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in ${formPath}`);
  }
  source = source.replace(before, after);
}

replaceOnce(
  'import FormListboxField from "@/components/ui/FormListboxField";',
  [
    'import KitImageLightbox from "@/components/admin/kits/KitImageLightbox";',
    'import FormListboxField from "@/components/ui/FormListboxField";',
  ].join("\n"),
  "captain kit lightbox import",
);

replaceOnce(
  [
    "              <img",
    "                src={`/api/kits/${selectedDesign.id}/image?size=thumb&v=${encodeURIComponent(",
    "                  selectedDesign.updatedAtIso,",
    "                )}`}",
    "                alt={`${selectedDesign.name ?? selectedDesign.code} selected kit`}",
    '                className="h-20 w-20 rounded-2xl border border-emerald-400/20 bg-white object-contain p-1"',
    "              />",
  ].join("\n"),
  [
    "              <KitImageLightbox",
    "                src={`/api/kits/${selectedDesign.id}/image?size=thumb&v=${encodeURIComponent(",
    "                  selectedDesign.updatedAtIso,",
    "                )}`}",
    "                fullSrc={`/api/kits/${selectedDesign.id}/image?size=full&v=${encodeURIComponent(",
    "                  selectedDesign.updatedAtIso,",
    "                )}`}",
    "                alt={`${selectedDesign.name ?? selectedDesign.code} selected kit`}",
    '                className="group relative block h-20 w-20 shrink-0 cursor-zoom-in overflow-hidden rounded-2xl border border-emerald-400/20 bg-white p-1"',
    '                imageClassName="h-full w-full object-contain"',
    "              />",
  ].join("\n"),
  "selected captain kit lightbox",
);

replaceOnce(
  [
    "                  return (",
    "                    <button",
    "                      key={design.id}",
    '                      type="button"',
    "                      onClick={() => setSelectedDesignId(design.id)}",
    "                      aria-pressed={selected}",
    "                      className={[",
    '                        "group overflow-hidden rounded-2xl border p-2 text-left transition",',
    "                        selected",
    '                          ? "border-emerald-400/60 bg-emerald-500/15 ring-2 ring-emerald-400/20"',
    '                          : "border-white/10 bg-black/20 hover:border-white/25 hover:bg-white/[0.05]",',
    '                      ].join(" ")}',
    "                    >",
    '                      <div className="aspect-square overflow-hidden rounded-xl bg-white">',
    "                        <img",
    "                          src={`/api/kits/${design.id}/image?size=thumb&v=${encodeURIComponent(",
    "                            design.updatedAtIso,",
    "                          )}`}",
    "                          alt={design.name ?? `Kit ${design.code}`}",
    '                          loading="lazy"',
    '                          className="h-full w-full object-contain p-1 transition group-hover:scale-[1.03]"',
    "                        />",
    "                      </div>",
    '                      <div className="px-1 pb-1 pt-2">',
    '                        <div className="truncate text-sm font-semibold text-white">',
    "                          {design.code}",
    "                        </div>",
    '                        <div className="mt-0.5 truncate text-[11px] text-white/40">',
    '                          {design.name ?? "Team kit"}',
    "                        </div>",
    "                      </div>",
    "                    </button>",
    "                  );",
  ].join("\n"),
  [
    "                  return (",
    "                    <div",
    "                      key={design.id}",
    "                      className={[",
    '                        "overflow-hidden rounded-2xl border p-2 transition",',
    "                        selected",
    '                          ? "border-emerald-400/60 bg-emerald-500/15 ring-2 ring-emerald-400/20"',
    '                          : "border-white/10 bg-black/20 hover:border-white/25 hover:bg-white/[0.05]",',
    '                      ].join(" ")}',
    "                    >",
    "                      <KitImageLightbox",
    "                        src={`/api/kits/${design.id}/image?size=thumb&v=${encodeURIComponent(",
    "                          design.updatedAtIso,",
    "                        )}`}",
    "                        fullSrc={`/api/kits/${design.id}/image?size=full&v=${encodeURIComponent(",
    "                          design.updatedAtIso,",
    "                        )}`}",
    "                        alt={design.name ?? `Kit ${design.code}`}",
    '                        className="group relative block aspect-square w-full cursor-zoom-in overflow-hidden rounded-xl bg-white"',
    '                        imageClassName="h-full w-full object-contain p-1 transition group-hover:scale-[1.03]"',
    "                      />",
    "                      <button",
    '                        type="button"',
    "                        onClick={() => setSelectedDesignId(design.id)}",
    "                        aria-pressed={selected}",
    '                        className="mt-2 flex w-full items-center justify-between gap-2 rounded-xl px-1 pb-1 pt-1 text-left"',
    "                      >",
    '                        <span className="min-w-0">',
    '                          <span className="block truncate text-sm font-semibold text-white">',
    "                            {design.code}",
    "                          </span>",
    '                          <span className="mt-0.5 block truncate text-[11px] text-white/40">',
    '                            {design.name ?? "Team kit"}',
    "                          </span>",
    "                        </span>",
    '                        <span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${',
    "                          selected",
    '                            ? "bg-emerald-300 text-black"',
    '                            : "border border-white/10 bg-white/[0.05] text-white/60"',
    "                        }`}>",
    '                          {selected ? "Selected" : "Choose"}',
    "                        </span>",
    "                      </button>",
    "                    </div>",
    "                  );",
  ].join("\n"),
  "captain kit card image preview and separate selection button",
);

if (
  !source.includes("KitImageLightbox") ||
  !source.includes('selected ? "Selected" : "Choose"') ||
  !source.includes("size=full")
) {
  throw new Error("Captain kit image lightbox was not added correctly.");
}

fs.writeFileSync(absolutePath, source, "utf8");
console.log(
  "Captain kit thumbnails now enlarge on click, with a separate Choose button for selection.",
);
