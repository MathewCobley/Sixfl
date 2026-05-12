// ========================================
// File: src/components/admin/communications/AdminTeamContactPhoneFallbackBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";

function normaliseEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

function normalisePhone(value: string | null | undefined) {
  return value?.replace(/\s+/g, "").trim() || null;
}

function getPageContactDetails() {
  const bodyText = document.body.innerText || "";
  const emailMatch = bodyText.match(/Email:\s*([^\n\r]+?)(?=\s{2,}|\n|SMS:|$)/i);
  const smsMatch = bodyText.match(/SMS:\s*(\+?\d[\d\s]{8,}\d)/i);

  return {
    email: normaliseEmail(emailMatch?.[1] ?? null),
    phone: smsMatch?.[1]?.trim() || null,
  };
}

function getLabelLines(label: HTMLLabelElement) {
  return (label.innerText || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function getRecipientCardDetails(label: HTMLLabelElement) {
  const lines = getLabelLines(label);
  const emailLine = lines.find((line) => line.toLowerCase().startsWith("email:"));
  const smsLine = lines.find((line) => line.toLowerCase().startsWith("sms:"));

  return {
    email: normaliseEmail(emailLine?.replace(/^email:\s*/i, "") ?? null),
    smsLine,
    hasSms: Boolean(smsLine && !/^sms:\s*[—-]?\s*$/i.test(smsLine)),
  };
}

function patchVisibleRecipientCards() {
  const { email: teamEmail, phone: teamPhone } = getPageContactDetails();
  if (!teamEmail || !teamPhone) return;

  const labels = Array.from(document.querySelectorAll("label"));

  for (const label of labels) {
    const htmlLabel = label as HTMLLabelElement;
    const details = getRecipientCardDetails(htmlLabel);

    if (!details.email || details.email !== teamEmail || details.hasSms) continue;

    const spans = Array.from(htmlLabel.querySelectorAll("span"));
    const smsSpan = spans.find((span) => /^SMS:\s*[—-]?\s*$/i.test(span.textContent?.trim() ?? ""));

    if (smsSpan) {
      smsSpan.textContent = `SMS: ${teamPhone}`;
      smsSpan.setAttribute("data-sixfl-team-phone-fallback", "true");
    }
  }
}

function selectedFallbackRecipientNeedsTeamContact() {
  const { email: teamEmail, phone: teamPhone } = getPageContactDetails();
  if (!teamEmail || !teamPhone) return false;

  const labels = Array.from(document.querySelectorAll("label"));

  return labels.some((label) => {
    const htmlLabel = label as HTMLLabelElement;
    const checkbox = htmlLabel.querySelector("input[type='checkbox']") as HTMLInputElement | null;
    if (!checkbox?.checked) return false;

    const details = getRecipientCardDetails(htmlLabel);
    return Boolean(details.email && details.email === teamEmail && !details.hasSms);
  });
}

function patchSmsSubmit() {
  const forms = Array.from(document.querySelectorAll("form"));
  const smsForm = forms.find((form) => {
    const channel = form.querySelector("input[name='channel']") as HTMLInputElement | null;
    return channel?.value === "SMS";
  }) as HTMLFormElement | undefined;

  if (!smsForm || smsForm.dataset.sixflTeamPhoneFallbackBound === "true") return;

  smsForm.dataset.sixflTeamPhoneFallbackBound = "true";
  smsForm.addEventListener("submit", () => {
    if (!selectedFallbackRecipientNeedsTeamContact()) return;

    const alreadyHasTeamRecipient = Array.from(
      smsForm.querySelectorAll("input[name='recipientValues']"),
    ).some((input) => (input as HTMLInputElement).value === "team:");

    if (alreadyHasTeamRecipient) return;

    const hidden = document.createElement("input");
    hidden.type = "hidden";
    hidden.name = "recipientValues";
    hidden.value = "team:";
    hidden.setAttribute("data-sixfl-team-phone-fallback", "true");
    smsForm.appendChild(hidden);
  });
}

function applyFallback() {
  patchVisibleRecipientCards();
  patchSmsSubmit();
}

export default function AdminTeamContactPhoneFallbackBridge() {
  useEffect(() => {
    applyFallback();

    const observer = new MutationObserver(applyFallback);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => observer.disconnect();
  }, []);

  return null;
}
