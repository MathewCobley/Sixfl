// ========================================
// File: src/components/admin/forms/AdminComboboxField.tsx
// ========================================

"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Combobox, Transition } from "@headlessui/react";
import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/24/outline";

type ComboboxOption = {
  id: string;
  label: string;
  description?: string | null;
  disabled?: boolean;
};

type AdminComboboxFieldProps = {
  name: string;
  label: string;
  options: ComboboxOption[];
  defaultValue?: string;
  placeholder?: string;
  emptyLabel?: string;
  required?: boolean;
  onSelectedIdChange?: (id: string) => void;
};

export default function AdminComboboxField({
  name,
  label,
  options,
  defaultValue = "",
  placeholder = "Search...",
  emptyLabel = "Nothing found",
  required = false,
  onSelectedIdChange,
}: AdminComboboxFieldProps) {
  const [query, setQuery] = useState("");

  const initialSelected =
    options.find((option) => option.id === defaultValue) ?? null;

  const [selected, setSelected] = useState<ComboboxOption | null>(initialSelected);

  useEffect(() => {
    const next = options.find((option) => option.id === defaultValue) ?? null;
    setSelected(next);
  }, [defaultValue, options]);

  useEffect(() => {
    onSelectedIdChange?.(selected?.id ?? "");
  }, [selected, onSelectedIdChange]);

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) return options;

    return options.filter((option) => {
      const haystack = `${option.label} ${option.description ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [options, query]);

  return (
    <div className="space-y-2">
      <label className="text-sm text-white/70">{label}</label>

      <input type="hidden" name={name} value={selected?.id ?? ""} />

      <Combobox value={selected} onChange={setSelected} nullable>
        <div className="relative">
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/30 transition focus-within:border-emerald-400/60 focus-within:bg-black/40">
            <Combobox.Input
              className="w-full bg-transparent px-4 py-3 pr-11 text-sm text-white outline-none placeholder:text-white/30"
              displayValue={(option: ComboboxOption | null) => option?.label ?? ""}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={placeholder}
              autoComplete="off"
            />

            <Combobox.Button
              type="button"
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-white/40 hover:text-white/70"
            >
              <ChevronUpDownIcon className="h-5 w-5" />
            </Combobox.Button>
          </div>

          <Transition
            as={Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
            afterLeave={() => setQuery("")}
          >
            <Combobox.Options className="absolute z-50 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-white/10 bg-[#090909] p-2 shadow-2xl shadow-black/50 ring-1 ring-white/5 focus:outline-none">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-3 text-sm text-white/45">{emptyLabel}</div>
              ) : (
                filteredOptions.map((option) => (
                  <Combobox.Option
                    key={option.id}
                    value={option}
                    disabled={option.disabled}
                    className={({ active, disabled }) =>
                      [
                        "relative cursor-pointer rounded-xl px-3 py-3 transition",
                        active ? "bg-emerald-500/12" : "bg-transparent",
                        disabled ? "cursor-not-allowed opacity-40" : "",
                      ].join(" ")
                    }
                  >
                    {({ selected: isSelected, active }) => (
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div
                            className={[
                              "truncate text-sm font-medium",
                              active ? "text-white" : "text-white/90",
                            ].join(" ")}
                          >
                            {option.label}
                          </div>

                          {option.description ? (
                            <div className="mt-1 truncate text-xs text-white/45">
                              {option.description}
                            </div>
                          ) : null}
                        </div>

                        {isSelected ? (
                          <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                        ) : null}
                      </div>
                    )}
                  </Combobox.Option>
                ))
              )}
            </Combobox.Options>
          </Transition>
        </div>
      </Combobox>

      {required && !selected ? (
        <p className="text-xs text-amber-300">Please select an option.</p>
      ) : null}
    </div>
  );
}