// ========================================
// File: src/components/admin/email-templates/EmailTemplateListControlsBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const BUTTON_CLASS_NAME =
  "inline-flex items-center rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-semibold text-white transition hover:border-emerald-400/35 hover:bg-emerald-500/10 hover:text-emerald-100";

type ListMode = "bullet" | "numbered";

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

function getLineRange(text: string, start: number, end: number) {
  const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const nextLineBreak = text.indexOf("\n", end);
  const lineEnd = nextLineBreak === -1 ? text.length : nextLineBreak;

  return { lineStart, lineEnd };
}

function stripExistingListMarker(line: string) {
  const match = line.match(/^(\s*)(?:-\s+|\d+\.\s+)?(.*)$/);

  return {
    indent: match?.[1] ?? "",
    text: match?.[2] ?? line,
  };
}

function formatLinesAsList(block: string, mode: ListMode) {
  let number = 1;

  return block
    .split("\n")
    .map((line) => {
      if (!line.trim()) return line;

      const { indent, text } = stripExistingListMarker(line);
      const trimmedText = text.trimStart();
      const marker = mode === "bullet" ? "-" : `${number++}.`;

      return `${indent}${marker} ${trimmedText || (mode === "bullet" ? "Bullet point" : "Numbered point")}`;
    })
    .join("\n");
}

function applyListFormatting(textarea: HTMLTextAreaElement, mode: ListMode) {
  const value = textarea.value;
  const start = textarea.selectionStart ?? value.length;
  const end = textarea.selectionEnd ?? value.length;
  const selectedText = value.slice(start, end);
  const fallbackText = mode === "bullet" ? "Bullet point" : "Numbered point";
  const fallbackPrefix = mode === "bullet" ? "- " : "1. ";

  if (selectedText.trim()) {
    const { lineStart, lineEnd } = getLineRange(value, start, end);
    const block = value.slice(lineStart, lineEnd);
    const nextBlock = formatLinesAsList(block, mode);
    const nextValue = `${value.slice(0, lineStart)}${nextBlock}${value.slice(lineEnd)}`;

    setTextareaValue(textarea, nextValue);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(lineStart, lineStart + nextBlock.length);
    });
    return;
  }

  const { lineStart, lineEnd } = getLineRange(value, start, end);
  const currentLine = value.slice(lineStart, lineEnd);

  if (currentLine.trim()) {
    const nextLine = formatLinesAsList(currentLine, mode);
    const nextValue = `${value.slice(0, lineStart)}${nextLine}${value.slice(lineEnd)}`;
    const nextCursor = lineStart + nextLine.length;

    setTextareaValue(textarea, nextValue);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
    return;
  }

  const replacement = `${fallbackPrefix}${fallbackText}`;
  const nextValue = `${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`;
  const selectionStart = lineStart + fallbackPrefix.length;
  const selectionEnd = selectionStart + fallbackText.length;

  setTextareaValue(textarea, nextValue);

  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(selectionStart, selectionEnd);
  });
}

function isEmailTemplateToolbarButton(target: EventTarget | null, label: string) {
  if (!(target instanceof HTMLElement)) return false;

  const button = target.closest("button");
  if (!(button instanceof HTMLButtonElement)) return false;

  const toolbar = button.closest("[data-email-template-bold-toolbar]");
  if (!toolbar) return false;

  return button.textContent?.trim().toLowerCase() === label.toLowerCase();
}

function findBodyTextarea() {
  return document.querySelector<HTMLTextAreaElement>('textarea[name="body"]');
}

function addNumberedButton() {
  const toolbar = document.querySelector<HTMLElement>(
    "[data-email-template-bold-toolbar]",
  );
  const buttonRow = toolbar?.querySelector("div.flex.flex-wrap.gap-2");

  if (!buttonRow || buttonRow.querySelector("[data-email-template-numbered-button]")) {
    return;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Numbered";
  button.dataset.emailTemplateNumberedButton = "true";
  button.className = BUTTON_CLASS_NAME;

  buttonRow.appendChild(button);
}

function installListControls() {
  addNumberedButton();
}

export default function EmailTemplateListControlsBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.startsWith("/admin/templates")) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      const textarea = findBodyTextarea();
      if (!textarea) return;

      if (isEmailTemplateToolbarButton(event.target, "Bullet")) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        applyListFormatting(textarea, "bullet");
        return;
      }

      if (isEmailTemplateToolbarButton(event.target, "Numbered")) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        applyListFormatting(textarea, "numbered");
      }
    };

    const installTimer = window.setTimeout(installListControls, 0);
    const observer = new MutationObserver(installListControls);

    document.addEventListener("click", handleClick, true);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.clearTimeout(installTimer);
      observer.disconnect();
      document.removeEventListener("click", handleClick, true);
    };
  }, [pathname]);

  return null;
}
