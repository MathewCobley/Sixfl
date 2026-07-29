// ========================================
// File: src/components/admin/email-templates/PlayerPoolTemplateCtaBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const PLAYER_POOL_TEMPLATE_KEY = "managed-squad-player-pool-opportunity";
const PLAYER_POOL_CTA_LABEL = "Join the PlayerPool";

function getPlayerPoolUrl() {
  const origin = window.location.origin.replace(/\/+$/, "");
  return `${origin}/player-pool`;
}

function setInputValue(input: HTMLInputElement, value: string) {
  if (input.value !== value) input.value = value;
  if (input.getAttribute("value") !== value) input.setAttribute("value", value);
}

function syncCommunicationForms() {
  const playerPoolUrl = getPlayerPoolUrl();

  document.querySelectorAll<HTMLFormElement>("form").forEach((form) => {
    const templateKeyInput = form.querySelector<HTMLInputElement>(
      'input[name="templateKey"]',
    );
    const ctaUrlInput = form.querySelector<HTMLInputElement>('input[name="ctaUrl"]');

    if (!templateKeyInput || !ctaUrlInput) return;
    if (templateKeyInput.value !== PLAYER_POOL_TEMPLATE_KEY) return;

    setInputValue(ctaUrlInput, playerPoolUrl);

    const ctaLabelInput = form.querySelector<HTMLInputElement>(
      'input[name="ctaLabel"]',
    );
    if (ctaLabelInput && !ctaLabelInput.value.trim()) {
      setInputValue(ctaLabelInput, PLAYER_POOL_CTA_LABEL);
    }
  });
}

function syncTemplateEditor() {
  const keyInput = document.querySelector<HTMLInputElement>('input[name="key"]');
  if (keyInput?.value !== PLAYER_POOL_TEMPLATE_KEY) return;

  const ctaUrlKeyInput = document.querySelector<HTMLInputElement>(
    'input[name="ctaUrlKey"]',
  );
  if (ctaUrlKeyInput) setInputValue(ctaUrlKeyInput, "signupUrl");

  const callToActionHeading = Array.from(
    document.querySelectorAll<HTMLHeadingElement>("h2"),
  ).find((heading) => heading.textContent?.trim() === "Call to action");
  const section = callToActionHeading?.closest("section");
  if (!section) return;

  const registerButton = Array.from(
    section.querySelectorAll<HTMLButtonElement>('button[type="button"]'),
  ).find((button) =>
    button.textContent?.includes("Register interest") ||
    button.textContent?.includes("PlayerPool profile"),
  );

  if (registerButton) {
    const label = registerButton.querySelector<HTMLElement>("div:first-child");
    if (label?.textContent !== "PlayerPool profile") {
      if (label) label.textContent = "PlayerPool profile";
    }

    const preview = registerButton.querySelector<HTMLElement>("div:nth-child(2)");
    const playerPoolUrl = getPlayerPoolUrl();
    if (preview && preview.textContent !== playerPoolUrl) {
      preview.textContent = playerPoolUrl;
    }
  }

  const playerPoolUrl = getPlayerPoolUrl();
  section.querySelectorAll<HTMLAnchorElement>('a[href*="/register-interest"]').forEach((link) => {
    if (link.href !== playerPoolUrl) link.href = playerPoolUrl;
  });
}

function syncPlayerPoolTemplateUi() {
  syncCommunicationForms();
  syncTemplateEditor();
}

export default function PlayerPoolTemplateCtaBridge() {
  const pathname = usePathname();

  useEffect(() => {
    let disposed = false;

    const sync = () => {
      if (!disposed) syncPlayerPoolTemplateUi();
    };

    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    const interval = window.setInterval(sync, 250);

    const handleSubmit = () => sync();
    document.addEventListener("submit", handleSubmit, true);
    document.addEventListener("change", sync, true);
    document.addEventListener("click", sync, true);

    return () => {
      disposed = true;
      observer.disconnect();
      window.clearInterval(interval);
      document.removeEventListener("submit", handleSubmit, true);
      document.removeEventListener("change", sync, true);
      document.removeEventListener("click", sync, true);
    };
  }, [pathname]);

  return null;
}
