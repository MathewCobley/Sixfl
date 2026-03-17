// ========================================
// File: src/components/admin/leads/TemplateSelect.tsx
// ========================================

"use client";

import { Fragment } from "react";
import { Listbox, Transition } from "@headlessui/react";
import { ChevronUpDownIcon, CheckIcon } from "@heroicons/react/20/solid";

export type TemplateOption = {
  value: string;
  label: string;
};

type Props = {
  label?: string;
  value: string;
  options: TemplateOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

export default function TemplateSelect({
  label = "Email template",
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "Select email template",
}: Props) {
  const selected = options.find((option) => option.value === value) ?? null;
  const hasSelection = !!selected;

  return (
    <div className="space-y-2">
      {label ? (
        <label className="block text-sm text-white/70">{label}</label>
      ) : null}

      <Listbox value={value} onChange={onChange} disabled={disabled}>
        <div className="relative">
          <Listbox.Button
            className={[
              "relative flex h-11 w-full items-center justify-between rounded-xl border px-4 text-left text-sm outline-none transition",
              disabled
                ? "cursor-not-allowed border-white/5 bg-white/[0.03] text-white/40"
                : "border-white/10 bg-black text-white hover:border-white/20 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20",
            ].join(" ")}
          >
            <span
              className={[
                "block truncate",
                hasSelection ? "text-white" : "text-white/45",
              ].join(" ")}
            >
              {hasSelection ? selected.label : placeholder}
            </span>

            <ChevronUpDownIcon
              className={[
                "ml-3 h-5 w-5 shrink-0",
                disabled ? "text-white/30" : "text-white/50",
              ].join(" ")}
              aria-hidden="true"
            />
          </Listbox.Button>

          {!disabled && (
            <Transition
              as={Fragment}
              leave="transition ease-in duration-100"
              leaveFrom="opacity-100 translate-y-0"
              leaveTo="opacity-0 translate-y-1"
            >
              <Listbox.Options className="absolute z-50 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-white/10 bg-zinc-950 p-1 shadow-2xl ring-1 ring-black/40 focus:outline-none">
                {options.map((option) => (
                  <Listbox.Option
                    key={option.value}
                    value={option.value}
                    className={({ active }) =>
                      [
                        "relative cursor-pointer select-none rounded-lg px-3 py-2.5 pr-10 text-sm transition",
                        active ? "bg-white/8 text-white" : "text-white/85",
                      ].join(" ")
                    }
                  >
                    {({ selected }) => (
                      <>
                        <span
                          className={[
                            "block truncate",
                            selected ? "font-medium text-emerald-300" : "",
                          ].join(" ")}
                        >
                          {option.label}
                        </span>

                        {selected ? (
                          <span className="absolute inset-y-0 right-3 flex items-center text-emerald-400">
                            <CheckIcon
                              className="h-5 w-5"
                              aria-hidden="true"
                            />
                          </span>
                        ) : null}
                      </>
                    )}
                  </Listbox.Option>
                ))}
              </Listbox.Options>
            </Transition>
          )}
        </div>
      </Listbox>
    </div>
  );
}