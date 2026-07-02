// ========================================
// File: src/components/admin/leagues/AdminDivisionSelectBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type OptionData = {
  value: string;
  label: string;
};

function getOptions(select: HTMLSelectElement): OptionData[] {
  return Array.from(select.options).map((option) => ({
    value: option.value,
    label: option.textContent?.trim() || option.value || "No division",
  }));
}

function getSelectedLabel(select: HTMLSelectElement, options: OptionData[]) {
  return (
    options.find((option) => option.value === select.value)?.label ||
    options[0]?.label ||
    "No division"
  );
}

function enhanceDivisionSelect(select: HTMLSelectElement) {
  if (select.dataset.sixflCustomDivisionSelect === "true") return;

  select.dataset.sixflCustomDivisionSelect = "true";
  select.classList.add("sr-only");
  select.tabIndex = -1;

  const options = getOptions(select);
  const wrapper = document.createElement("div");
  wrapper.dataset.sixflDivisionPicker = "true";
  wrapper.className = "relative min-w-0";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "relative flex h-12 w-full items-center justify-between rounded-xl border border-white/10 bg-[#0d1428] px-4 text-left text-sm text-white outline-none transition hover:border-white/20 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20";

  const label = document.createElement("span");
  label.className = "block truncate";
  label.textContent = getSelectedLabel(select, options);

  const icon = document.createElement("span");
  icon.className = "ml-3 shrink-0 text-white/50";
  icon.textContent = "⌄";

  button.append(label, icon);

  const menu = document.createElement("div");
  menu.className = "absolute z-[999] mt-2 hidden max-h-64 w-full overflow-auto rounded-xl border border-white/10 bg-zinc-950 p-1 shadow-2xl ring-1 ring-black/40";

  function closeMenu() {
    menu.classList.add("hidden");
    button.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    menu.classList.remove("hidden");
    button.setAttribute("aria-expanded", "true");
  }

  function setValue(value: string) {
    select.value = value;
    label.textContent = getSelectedLabel(select, options);
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    closeMenu();
  }

  for (const option of options) {
    const optionButton = document.createElement("button");
    optionButton.type = "button";
    optionButton.className = "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm text-white/85 transition hover:bg-white/8 hover:text-white";
    optionButton.textContent = option.label;
    optionButton.addEventListener("click", () => setValue(option.value));
    menu.appendChild(optionButton);
  }

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (menu.classList.contains("hidden")) openMenu();
    else closeMenu();
  });

  document.addEventListener("click", (event) => {
    if (!wrapper.contains(event.target as Node)) closeMenu();
  });

  select.insertAdjacentElement("afterend", wrapper);
  wrapper.append(button, menu);
}

function enhanceAllDivisionSelects() {
  const selects = Array.from(
    document.querySelectorAll<HTMLSelectElement>('select[name="divisionId"]'),
  );

  for (const select of selects) {
    enhanceDivisionSelect(select);
  }
}

export default function AdminDivisionSelectBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.startsWith("/admin/")) return;

    enhanceAllDivisionSelects();

    const observer = new MutationObserver(() => {
      enhanceAllDivisionSelects();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
