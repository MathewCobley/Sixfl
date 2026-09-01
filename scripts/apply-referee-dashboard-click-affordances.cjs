const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(
  process.cwd(),
  "src",
  "app",
  "(public)",
  "referee",
  "page.tsx",
);

function countOccurrences(source, value) {
  return source.split(value).length - 1;
}

function applyPatch() {
  if (!fs.existsSync(pagePath)) {
    throw new Error("Referee dashboard page was not found.");
  }

  let source = fs.readFileSync(pagePath, "utf8");
  let changed = false;

  function replaceOnce(before, after, label) {
    if (source.includes(after)) return;
    if (!source.includes(before)) {
      throw new Error(
        `Referee dashboard click affordances: ${label} anchor was not found.`,
      );
    }
    source = source.replace(before, after);
    changed = true;
  }

  replaceOnce(
    [
      "    <Link",
      "      href={href}",
      "      className={[",
      '        "rounded-3xl border p-5 transition",',
      "        primary",
      '          ? "border-emerald-400/25 bg-emerald-500/12 hover:bg-emerald-500/18"',
      '          : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]",',
      '      ].join(" ")}',
      "    >",
      '      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">',
      "        {label}",
      "      </p>",
      '      <p className="mt-3 text-xl font-semibold text-white">{title}</p>',
      '      <p className="mt-2 text-sm leading-5 text-white/60">{text}</p>',
      "    </Link>",
    ].join("\n"),
    [
      "    <Link",
      "      href={href}",
      '      data-referee-action-card="true"',
      "      className={[",
      '        "group flex min-h-[176px] cursor-pointer flex-col rounded-3xl border p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(16,185,129,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07130f]",',
      "        primary",
      '          ? "border-emerald-400/30 bg-emerald-500/12 hover:border-emerald-300/50 hover:bg-emerald-500/18"',
      '          : "border-white/10 bg-white/[0.04] hover:border-emerald-400/35 hover:bg-white/[0.07]",',
      '      ].join(" ")}',
      "    >",
      '      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">',
      "        {label}",
      "      </p>",
      '      <p className="mt-3 text-xl font-semibold text-white">{title}</p>',
      '      <p className="mt-2 text-sm leading-5 text-white/60">{text}</p>',
      '      <div className="mt-auto flex items-center justify-between border-t border-white/10 pt-4">',
      '        <span className="text-sm font-bold text-emerald-100">Open</span>',
      "        <span",
      '          aria-hidden="true"',
      '          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/15 text-lg font-bold text-emerald-100 transition group-hover:translate-x-1 group-hover:bg-emerald-500/25"',
      "        >",
      "          →",
      "        </span>",
      "      </div>",
      "    </Link>",
    ].join("\n"),
    "action-card presentation",
  );

  replaceOnce(
    [
      '    <details className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">',
      '      <summary className="flex cursor-pointer list-none flex-col gap-2 px-6 py-5 transition hover:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between [&::-webkit-details-marker]:hidden">',
    ].join("\n"),
    [
      "    <details",
      '      data-referee-expandable-card="ledger"',
      '      className="group overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] transition duration-200 hover:border-emerald-400/30"',
      "    >",
      '      <summary className="flex cursor-pointer list-none flex-col gap-3 px-6 py-5 outline-none transition hover:bg-emerald-500/[0.05] focus-visible:bg-emerald-500/[0.06] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/60 sm:flex-row sm:items-center sm:justify-between [&::-webkit-details-marker]:hidden">',
    ].join("\n"),
    "ledger expandable-card shell",
  );

  replaceOnce(
    [
      '        <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-white/55">',
      '          {ledgerNights.length} item{ledgerNights.length === 1 ? "" : "s"} · open details',
      "        </div>",
    ].join("\n"),
    [
      '        <div className="flex flex-wrap items-center gap-3">',
      '          <span className="text-xs font-medium text-white/50">',
      '            {ledgerNights.length} item{ledgerNights.length === 1 ? "" : "s"}',
      "          </span>",
      '          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/35 bg-emerald-500/15 px-4 py-2 text-sm font-bold text-emerald-100 transition group-hover:bg-emerald-500/22">',
      '            <span className="group-open:hidden">Open details</span>',
      '            <span className="hidden group-open:inline">Close details</span>',
      "            <span",
      '              aria-hidden="true"',
      '              className="text-base leading-none transition-transform duration-200 group-open:rotate-180"',
      "            >",
      "              ⌄",
      "            </span>",
      "          </span>",
      "        </div>",
    ].join("\n"),
    "ledger open control",
  );

  replaceOnce(
    [
      '    <details id="referee-nights" className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">',
      '      <summary className="flex cursor-pointer list-none flex-col gap-2 px-6 py-5 transition hover:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between [&::-webkit-details-marker]:hidden">',
    ].join("\n"),
    [
      "    <details",
      '      id="referee-nights"',
      '      data-referee-expandable-card="schedule"',
      '      className="group overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] transition duration-200 hover:border-emerald-400/30"',
      "    >",
      '      <summary className="flex cursor-pointer list-none flex-col gap-3 px-6 py-5 outline-none transition hover:bg-emerald-500/[0.05] focus-visible:bg-emerald-500/[0.06] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/60 sm:flex-row sm:items-center sm:justify-between [&::-webkit-details-marker]:hidden">',
    ].join("\n"),
    "night-schedule expandable-card shell",
  );

  replaceOnce(
    [
      '        <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-white/55">',
      "          {nights.length} total · open schedule",
      "        </div>",
    ].join("\n"),
    [
      '        <div className="flex flex-wrap items-center gap-3">',
      '          <span className="text-xs font-medium text-white/50">',
      "            {nights.length} total",
      "          </span>",
      '          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/35 bg-emerald-500/15 px-4 py-2 text-sm font-bold text-emerald-100 transition group-hover:bg-emerald-500/22">',
      '            <span className="group-open:hidden">Open schedule</span>',
      '            <span className="hidden group-open:inline">Close schedule</span>',
      "            <span",
      '              aria-hidden="true"',
      '              className="text-base leading-none transition-transform duration-200 group-open:rotate-180"',
      "            >",
      "              ⌄",
      "            </span>",
      "          </span>",
      "        </div>",
    ].join("\n"),
    "night-schedule open control",
  );

  const required = [
    'data-referee-action-card="true"',
    'data-referee-expandable-card="ledger"',
    'data-referee-expandable-card="schedule"',
    "hover:-translate-y-0.5",
    "focus-visible:ring-emerald-400/70",
    ">Open</span>",
    "Open details",
    "Close details",
    "Open schedule",
    "Close schedule",
    "group-open:rotate-180",
  ];

  for (const token of required) {
    if (!source.includes(token)) {
      throw new Error(
        `Referee dashboard click affordances are missing required marker: ${token}`,
      );
    }
  }

  if (
    source.includes("· open details") ||
    source.includes("· open schedule") ||
    countOccurrences(source, 'data-referee-action-card="true"') !== 1 ||
    countOccurrences(source, "group-open:rotate-180") !== 2
  ) {
    throw new Error(
      "Referee dashboard click affordances are incomplete or duplicated.",
    );
  }

  if (changed) {
    fs.writeFileSync(pagePath, source, "utf8");
  }

  return changed;
}

const firstPassChanged = applyPatch();
const secondPassChanged = applyPatch();

if (secondPassChanged) {
  throw new Error("Referee dashboard click-affordance patch is not idempotent.");
}

console.log(
  firstPassChanged
    ? "Referee dashboard links and expandable panels now have obvious open controls, hover movement and keyboard focus states."
    : "Referee dashboard click affordances already applied.",
);
