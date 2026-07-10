// ========================================
// File: src/components/admin/email-templates/EmailTemplatePollBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";

const BRIDGE_ID = "sixfl-email-template-poll-helper";
const POLL_OPTIONS_TOKEN = "{{pollOptions}}";
const POLL_LINK_TOKEN = "{{pollLink}}";
const DEMO_TOKEN = "preview-team-token";

type PollPreviewOption = {
  id: string;
  label: string;
  sortOrder: number;
};

type PollPreview = {
  id: string;
  title: string;
  question: string;
  status: string;
  options: PollPreviewOption[];
};

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

function getPollVoteUrl(optionId: string) {
  return `https://www.sixfl.co.uk/polls/${DEMO_TOKEN}/vote/${encodeURIComponent(optionId)}`;
}

function getPollUrl() {
  return `https://www.sixfl.co.uk/polls/${DEMO_TOKEN}`;
}

function renderPollPreview(container: HTMLElement, poll: PollPreview | null) {
  container.replaceChildren();

  const heading = document.createElement("div");
  heading.className = "text-xs font-semibold uppercase tracking-[0.18em] text-white/45";
  heading.textContent = "Selected poll preview";
  container.appendChild(heading);

  if (!poll) {
    const empty = document.createElement("div");
    empty.className = "mt-3 rounded-xl border border-white/10 bg-black/20 p-4 text-xs leading-5 text-white/50";
    empty.textContent = "Choose a poll above to preview the buttons that will replace {{pollOptions}}.";
    container.appendChild(empty);
    return;
  }

  const card = document.createElement("div");
  card.className = "mt-3 rounded-2xl border border-white/10 bg-black/25 p-4";

  const title = document.createElement("div");
  title.className = "text-sm font-semibold text-white";
  title.textContent = poll.title;

  const question = document.createElement("div");
  question.className = "mt-1 text-xs leading-5 text-white/60";
  question.textContent = poll.question;

  const buttonWrap = document.createElement("div");
  buttonWrap.className = "mt-4 flex flex-wrap gap-2";

  for (const option of poll.options) {
    const anchor = document.createElement("a");
    anchor.href = getPollVoteUrl(option.id);
    anchor.target = "_blank";
    anchor.className = "rounded-xl bg-[#1E5A43] px-4 py-2.5 text-xs font-bold text-white no-underline";
    anchor.textContent = option.label;
    buttonWrap.appendChild(anchor);
  }

  const link = document.createElement("div");
  link.className = "mt-3 break-all text-[11px] text-cyan-100/60";
  link.textContent = `Full poll link preview: ${getPollUrl()}`;

  card.append(title, question, buttonWrap, link);
  container.appendChild(card);
}

async function loadPolls() {
  const response = await fetch("/api/admin/polls/template-preview", {
    cache: "no-store",
  });

  if (!response.ok) return [] as PollPreview[];
  const payload = (await response.json()) as { polls?: PollPreview[] };
  return payload.polls ?? [];
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
      "Use these placeholders in reusable team email templates. Pick a poll below to preview the buttons. When you send from Email/SMS selected teams, SIXFL creates unique voting links for each selected team.";

    const previewControls = document.createElement("div");
    previewControls.className = "mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]";

    const pollSelect = document.createElement("select");
    pollSelect.className = "h-11 rounded-xl border border-cyan-400/20 bg-black/35 px-3 text-sm text-white outline-none focus:border-cyan-300/50";

    const loadingOption = document.createElement("option");
    loadingOption.value = "";
    loadingOption.textContent = "Loading polls...";
    pollSelect.appendChild(loadingOption);

    const openPolls = document.createElement("a");
    openPolls.href = "/admin/polls";
    openPolls.className = "inline-flex h-11 items-center justify-center rounded-xl border border-cyan-400/20 bg-black/25 px-4 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/10";
    openPolls.textContent = "Open polls";

    previewControls.append(pollSelect, openPolls);

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

    const preview = document.createElement("div");
    preview.className = "mt-4";
    renderPollPreview(preview, null);

    const note = document.createElement("p");
    note.className = "mt-3 text-[11px] leading-5 text-cyan-100/60";
    note.textContent =
      "The poll selected here is for preview only. The actual poll is chosen when you send the email, so the same template can be reused for future polls.";

    helper.append(heading, copy, previewControls, buttonRow, preview, note);
    textarea.parentElement.insertBefore(helper, textarea);

    loadPolls()
      .then((polls) => {
        pollSelect.replaceChildren();

        const emptyOption = document.createElement("option");
        emptyOption.value = "";
        emptyOption.textContent = polls.length ? "Choose poll to preview" : "No polls found";
        pollSelect.appendChild(emptyOption);

        for (const poll of polls) {
          const option = document.createElement("option");
          option.value = poll.id;
          option.textContent = `${poll.title}${poll.status === "DRAFT" ? " (draft)" : ""}`;
          pollSelect.appendChild(option);
        }

        pollSelect.addEventListener("change", () => {
          const selectedPoll = polls.find((poll) => poll.id === pollSelect.value) ?? null;
          renderPollPreview(preview, selectedPoll);
        });
      })
      .catch(() => {
        pollSelect.replaceChildren();
        const errorOption = document.createElement("option");
        errorOption.value = "";
        errorOption.textContent = "Could not load polls";
        pollSelect.appendChild(errorOption);
      });
  }, []);

  return null;
}
