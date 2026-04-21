// ========================================
// File: src/components/admin/communications/CompactLauncherPicker.tsx
// ========================================

"use client";

import { useMemo, useState } from "react";

type Option = {
  id: string;
  title: string;
  subtitle?: string | null;
};

type Props = {
  label: string;
  placeholder: string;
  options: Option[];
  selectedId: string;
  onSelect: (id: string) => void;
};

export default function CompactLauncherPicker({
  label,
  placeholder,
  options,
  selectedId,
  onSelect,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () => options.find((option) => option.id === selectedId) ?? null,
    [options, selectedId],
  );

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return options.slice(0, 10);

    return options
      .filter((option) => {
        const haystack = `${option.title} ${option.subtitle ?? ""}`.toLowerCase();
        return haystack.includes(value);
      })
      .slice(0, 12);
  }, [options, query]);

  return (
    <div className="space-y-3">
      <label className="block text-sm text-white/70">{label}</label>

      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="flex h-12 w-full items-center justify-between rounded-xl border border-white/10 bg-black px-4 text-left text-sm text-white transition hover:border-white/20"
      >
        <span className={selected ? "text-white" : "text-white/45"}>
          {selected ? selected.title : placeholder}
        </span>
        <span className="text-white/50">▾</span>
      </button>

      {isOpen ? (
        <div className="rounded-2xl border border-white/10 bg-black/95 p-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${label.toLowerCase()}`}
            className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-500/60"
          />

          <div className="mt-3 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-black/40">
            {filtered.length === 0 ? (
              <div className="px-4 py-4 text-sm text-white/55">No matches found.</div>
            ) : (
              <div className="divide-y divide-white/10">
                {filtered.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      onSelect(option.id);
                      setIsOpen(false);
                    }}
                    className="block w-full px-4 py-4 text-left transition hover:bg-white/[0.04]"
                  >
                    <div className="text-sm font-semibold text-white">{option.title}</div>
                    {option.subtitle ? (
                      <div className="mt-1 text-xs text-white/45">{option.subtitle}</div>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
