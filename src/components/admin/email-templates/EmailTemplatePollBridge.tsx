// ========================================
// File: src/components/admin/email-templates/EmailTemplatePollBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";

const BRIDGE_ID = "sixfl-email-template-poll-helper";
const POLL_OPTIONS_TOKEN = "{{pollOptions}}";
const POLL_LINK_TOKEN = "{{pollLink}}";

function setNativeTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  );

  descriptor?.set?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function insertAtCursor(textarea: HTMLTextAreaElement, text: string) {
  const current = textarea.value;
  const start = textarea.selectionStart ?? current.length;
  const end = textarea.selectionEnd ?? current.length;
  const needsLeadingBreak = start > 0 && current[start - 1] !== "\n";
  const insertion = `${needsLeadingBreak ? "\n" : ""}${text}`;
  const next = `${current.slice(0, start)}${insertion}${current.slice(end)}`;
  const nextCursor = start + insertion.length;

  setNativeTextareaValue(textarea, next);
  textarea.focus();
  requestAnimationFrame(() => textarea.setSelectionRange(nextCursor, nextCursor));
}

function createButton(label: string, onClick: () => void) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.className =
    "rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/15";
  button.addEventListener("click", onClick);
  return button;
}

export default function EmailTemplatePollBridge() {
  useEffect(() => {
    if (document.getElementById(BRIDGE_ID)) return;

    const textarea = document.querySelector<HTMLTextAreaElement>('textarea[name="body"]');
    if (!textarea?.parentElement) return;

    const helper = document.createElement("div");
    helper.id = BRIDGE_ID;
    helper.className =
      "mb-4 rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.07] p-4";

    const heading = document.createElement("div");
    heading.className =
      "text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200";
    heading.textContent = "Poll options";

    const copy = document.createElement("p");
    copy.className = "mt-2 text-xs leading-5 text-cyan-100/80";
    copy.textContent =
      "Use these placeholders in reusable team email templates. When you send from Email/SMS selected teams and choose a poll, SIXFL replaces them with each team's own voting links.";

    const buttonRow = document.createElement("div");
    buttonRow.className = "mt-3 flex flex-wrap gap-2";

    buttonRow.append(
      createButton(`Insert ${POLL_OPTIONS_TOKEN}`, () => {
        insertAtCursor(textarea, POLL_OPTIONS_TOKEN);
      }),
      createButton(`Insert ${POLL_LINK_TOKEN}`, () => {
        insertAtCursor(textarea, POLL_LINK_TOKEN);
      }),
      createButton("Insert suggested poll block", () => {
        insertAtCursor(
          textarea,
          [
            "Please let us know which option works best for your team:",
            "",
            POLL_OPTIONS_TOKEN,
            "",
            `Or open the poll here: ${POLL_LINK_TOKEN}`,
          ].join("\n"),
        );
      }),
    );

    const note = document.createElement("p");
    note.className = "mt-3 text-[11px] leading-5 text-cyan-100/60";
    note.textContent =
      "Do not paste individual poll links into templates. Use {{pollOptions}} so the normal comms system creates unique links for each selected team.";

    helper.append(heading, copy, buttonRow, note);
    textarea.parentElement.insertBefore(helper, textarea);
  }, []);

  return null;
}
