// ========================================
// File: src/components/referee/RefereeCashMethodSelect.tsx
// ========================================

"use client";

import { Fragment, useState } from "react";
import { Listbox, Transition } from "@headlessui/react";
import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/20/solid";

const METHOD_OPTIONS = [
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "OTHER", label: "Other" },
] as const;

type MethodValue = (typeof METHOD_OPTIONS)[number]["value"];

type Props = {
  name: string;
  defaultValue?: MethodValue;
};

export default function RefereeCashMethodSelect({
  name,
  defaultValue = "CASH",
}: Props) {
  const [value, setValue] = useState<MethodValue>(defaultValue);
  const selected = METHOD_OPTIONS.find((option) => option.value === value) ?? METHOD_OPTIONS[0];

  return (
    <div className="relative z-50">
      <input type="hidden" name={name} value={value} />

      <Listbox value={value} onChange={setValue}>
        <div className="relative">
          <Listbox.Button className="flex h-11 w-full items-center justify-between rounded-xl border border-white/10 bg-black/40 px-3 text-left text-sm text-white outline-none transition hover:border-white/20 focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/15">
            <span className="truncate">{selected.label}</span>
            <ChevronUpDownIcon className="ml-3 h-5 w-5 shrink-0 text-white/45" aria-hidden="true" />
          </Listbox.Button>

          <Transition
            as={Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100 translate-y-0"
            leaveTo="opacity-0 translate-y-1"
          >
            <Listbox.Options className="absolute z-[100] mt-2 max-h-64 w-full overflow-auto rounded-xl border border-white/10 bg-zinc-950 p-1 shadow-2xl ring-1 ring-black/40 focus:outline-none">
              {METHOD_OPTIONS.map((option) => (
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
                      <span className={["block truncate", selected ? "font-medium text-emerald-300" : ""].join(" ")}>{option.label}</span>
                      {selected ? (
                        <span className="absolute inset-y-0 right-3 flex items-center text-emerald-400">
                          <CheckIcon className="h-5 w-5" aria-hidden="true" />
                        </span>
                      ) : null}
                    </>
                  )}
                </Listbox.Option>
              ))}
            </Listbox.Options>
          </Transition>
        </div>
      </Listbox>
    </div>
  );
}
