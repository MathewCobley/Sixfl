// ========================================
// File: src/components/admin/email-templates/EmailTemplateBoldButtonBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  );

  if (descriptor?.set) {
    descriptor.set.call(textarea, value);
  } else {
    textarea.value = value;
  }

  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function wrapSelectedBodyText(textarea: HTMLTextAreaElement) {
  const value = textarea.value;
  const start = textarea.selectionStart ?? value.length;
  const end = textarea.selectionEnd ?? value.length;
  const selectedText = value.slice(start, end);
  const fallbackText = "bold text";
  const innerText = selectedText || fallbackText;
  const replacement = `**${innerText}**`;
  const nextValue = `${value.slice(0, start)}${replacement}${value.slice(end)}`;

  setTextareaValue(textarea, nextValue);

  requestAnimationFrame(() => {
    textarea.focus();

    if (selectedText) {
      const cursor = start + replacement.length;
      textarea.setSelectionRange(cursor, cursor);
      return;
    }

    const selectionStart = start + 2;
    const selectionEnd = selectionStart + fallbackText.length;
    textarea.setSelectionRange(selectionStart, selectionEnd);
  });
}

function createBoldToolbar(textarea: HTMLTextAreaElement) {
  const parent = textarea.parentElement;
  if (!parent || parent.querySelector("[data-email-template-bold-toolbar]")) {
    return;
  }

  const toolbar = document.createElement("div");
  toolbar.dataset.emailTemplateBoldToolbar = "true";
  toolbar.className = "mb-2 flex flex-wrap items-center gap-2";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Bold";
  button.title = "Wrap the selected text in bold formatting";
  button.className =
    "inline-flex min-h-9 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-sm font-bold text-emerald-200 transition hover:bg-emerald-500/15";
  button.addEventListener("click", () => wrapSelectedBodyText(textarea));

  const hint = document.createElement("span");
  hint.className = "text-xs text-neutral-400";
  hint.textContent = "Select text and click Bold, or type **bold text**.";

  toolbar.append(button, hint);
  parent.insertBefore(toolbar, textarea);
}

function installBoldButton() {
  const textarea = document.querySelector<HTMLTextAreaElement>(
    'textarea[name="body"]',
  );

  if (!textarea) return;

  createBoldToolbar(textarea);
}

export default function EmailTemplateBoldButtonBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.startsWith("/admin/templates")) {
      return;
    }

    const installTimer = window.setTimeout(installBoldButton, 0);
    const observer = new MutationObserver(installBoldButton);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.clearTimeout(installTimer);
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
