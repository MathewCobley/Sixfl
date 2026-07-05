// ========================================
// File: src/components/ui/FormListboxField.tsx
// ========================================

"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Listbox, Transition } from "@headlessui/react";
import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/20/solid";

export type FormListboxOption = {
  value: string;
  label: string;
};

type Props = {
  name: string;
  label?: string;
  value?: string;
  options: FormListboxOption[];
  placeholder?: string;
  disabled?: boolean;
};

export default function FormListboxField({
  name,
  label,
  value = "",
  options,
  placeholder = "Select option",
  disabled = false,
}: Props) {
  const [selectedValue, setSelectedValue] = useState(value);
  const [openDirection, setOpenDirection] = useState<"up" | "down">("down");
  const fieldRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSelectedValue(value);
  }, [value]);

  if (name === "responseTeamId" && placeholder === "Choose team for YES/NO") {
    return <input type="hidden" name={name} value="" />;
  }

  function updateOpenDirection() {
    const rect = fieldRef.current?.getBoundingClientRect();

    if (!rect) return;

    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const preferredPanelHeight = Math.min(256, Math.max(180, options.length * 46));

    setOpenDirection(
      spaceBelow < preferredPanelHeight && spaceAbove > spaceBelow ? "up" : "down",
    );
  }

  const selected = useMemo(
    () => options.find((option) => option.value === selectedValue) ?? null,
    [options, selectedValue],
  );

  return (
    <div className="space-y-2">
      {label ? (
        <label className="block text-sm text-white/70">{label}</label>
      ) : null}

      <input type="hidden" name={name} value={selectedValue} />

      <Listbox value={selectedValue} onChange={setSelectedValue} disabled={disabled}>
        {({ open }) => {
          if (open) {
            window.requestAnimationFrame(updateOpenDirection);
          }

          return (
            <div ref={fieldRef} className="relative">
              <Listbox.Button
                onClick={updateOpenDirection}
                onFocus={updateOpenDirection}
                className={[
                  "relative flex h-12 w-full items-center justify-between rounded-xl border px-4 text-left text-sm outline-none transition",
                  disabled
                    ? "cursor-not-allowed border-white/5 bg-white/[0.03] text-white/40"
                    : "border-white/10 bg-[#0d1428] text-white hover:border-white/20 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20",
                ].join(" ")}
              >
                <span
                  className={[
                    "block truncate",
                    selected ? "text-white" : "text-white/45",
                  ].join(" ")}
                >
                  {selected ? selected.label : placeholder}
                </span>

                <ChevronUpDownIcon
                  className={[
                    "ml-3 h-5 w-5 shrink-0",
                    disabled ? "text-white/30" : "text-white/50",
                  ].join(" ")}
                  aria-hidden="true"
                />
              </Listbox.Button>

              {!disabled ? (
                <Transition
                  as={Fragment}
                  leave="transition ease-in duration-100"
                  leaveFrom="opacity-100 translate-y-0"
                  leaveTo={openDirection === "up" ? "opacity-0 -translate-y-1" : "opacity-0 translate-y-1"}
                >
                  <Listbox.Options
                    className={[
                      "absolute z-[999] max-h-64 w-full overflow-auto rounded-xl border border-white/10 bg-zinc-950 p-1 shadow-2xl ring-1 ring-black/40 focus:outline-none",
                      openDirection === "up" ? "bottom-full mb-2" : "top-full mt-2",
                    ].join(" ")}
                  >
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
                                <CheckIcon className="h-5 w-5" aria-hidden="true" />
                              </span>
                            ) : null}
                          </>
                        )}
                      </Listbox.Option>
                    ))}
                  </Listbox.Options>
                </Transition>
              ) : null}
            </div>
          );
        }}
      </Listbox>
    </div>
  );
}
