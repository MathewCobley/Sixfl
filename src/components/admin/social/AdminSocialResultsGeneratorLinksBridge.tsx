// ========================================
// File: src/components/admin/social/AdminSocialResultsGeneratorLinksBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function getFormValue(form: HTMLFormElement, name: string) {
  return form.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value.trim() || "";
}

function buildResultsGeneratorHref(form: HTMLFormElement) {
  const leagueId = getFormValue(form, "leagueId");
  const fixtureDate = getFormValue(form, "fixtureDate");

  const params = new URLSearchParams();
  if (leagueId) params.set("leagueId", leagueId);
  if (fixtureDate) params.set("fixtureDate", fixtureDate);

  return `/admin/social/results${params.toString() ? `?${params.toString()}` : ""}`;
}

function enhanceResultsCardButtons() {
  const resultForms = Array.from(
    document.querySelectorAll<HTMLFormElement>('form input[name="postType"][value="RESULT"]'),
  )
    .map((input) => input.closest("form"))
    .filter((form): form is HTMLFormElement => form instanceof HTMLFormElement);

  for (const form of resultForms) {
    if (form.dataset.visualResultsGeneratorEnhanced === "true") continue;

    const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (!submitButton) continue;

    form.dataset.visualResultsGeneratorEnhanced = "true";
    submitButton.textContent = "Old results queue";

    const link = document.createElement("a");
    link.href = buildResultsGeneratorHref(form);
    link.textContent = "Open visual results card";
    link.className =
      "inline-flex h-10 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-500/15 px-3 text-xs font-semibold text-emerald-100 transition hover:border-emerald-300/35 hover:bg-emerald-500/20";

    form.insertAdjacentElement("afterend", link);
  }
}

function addResultsGeneratorIntro() {
  if (document.querySelector("[data-visual-results-generator-intro]")) return;

  const socialHeading = Array.from(document.querySelectorAll<HTMLElement>("h1")).find((heading) =>
    heading.textContent?.includes("Publish one match card per league night"),
  );

  const hero = socialHeading?.closest("div.rounded-3xl");
  if (!hero?.parentElement) return;

  const intro = document.createElement("div");
  intro.dataset.visualResultsGeneratorIntro = "true";
  intro.className =
    "rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.08] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.28)]";
  intro.innerHTML = `
    <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200/80">Visual results cards</p>
        <h2 class="mt-2 text-xl font-semibold tracking-tight text-white">Use the Canva-style results generator</h2>
        <p class="mt-2 max-w-3xl text-sm leading-6 text-white/60">Use this for the new image-based match results card. The older queue remains below for captions/publishing until we fully merge the flows.</p>
      </div>
      <a href="/admin/social/results" class="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-500/20">Open visual results generator</a>
    </div>
  `;

  hero.insertAdjacentElement("afterend", intro);
}

export default function AdminSocialResultsGeneratorLinksBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/admin/social") return;

    addResultsGeneratorIntro();
    enhanceResultsCardButtons();

    const observer = new MutationObserver(() => {
      addResultsGeneratorIntro();
      enhanceResultsCardButtons();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
