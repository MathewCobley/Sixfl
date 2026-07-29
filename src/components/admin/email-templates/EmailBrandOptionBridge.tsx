"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import {
  PLAYER_POOL_EMAIL_BRAND_MARKER,
  SIXFL_TV_EMAIL_BRAND_MARKER,
} from "@/lib/email/buildEmail";

const CONTROL_ATTR = "data-sixfl-email-brand-control";
const HIDDEN_NAME = "emailBrandKey";
const SIXFL_EMAIL_LOGO_URL = "https://www.sixfl.co.uk/sixfl-email.png";
const SIXFL_TV_LOGO_URL = "https://www.sixfl.co.uk/Sixfl-tv.png";
const PLAYER_POOL_LOGO_URL =
  "https://www.sixfl.co.uk/logos/sixfl%20player%20pool%20.png";

type BrandKey = "sixfl" | "sixfl-tv" | "player-pool";
type BrandTone = "sixfl" | "tv" | "player-pool";

function isTemplateBuilderPath(pathname: string | null) {
  return Boolean(
    pathname === "/admin/templates/new" ||
      pathname?.startsWith("/admin/templates/"),
  );
}

function getBuilderForm() {
  const body = document.querySelector<HTMLTextAreaElement>('textarea[name="body"]');
  return body?.closest("form") ?? null;
}

function getBrandFromBody(value: string): BrandKey {
  if (value.includes(PLAYER_POOL_EMAIL_BRAND_MARKER)) return "player-pool";
  if (value.includes(SIXFL_TV_EMAIL_BRAND_MARKER)) return "sixfl-tv";
  return "sixfl";
}

function removeBrandMarkers(value: string) {
  return value
    .replaceAll(SIXFL_TV_EMAIL_BRAND_MARKER, "")
    .replaceAll(PLAYER_POOL_EMAIL_BRAND_MARKER, "")
    .replace(/^\s*\n/, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimStart();
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function setBrandOnBody(textarea: HTMLTextAreaElement, brand: BrandKey) {
  const cleanBody = removeBrandMarkers(textarea.value);
  const marker =
    brand === "sixfl-tv"
      ? SIXFL_TV_EMAIL_BRAND_MARKER
      : brand === "player-pool"
        ? PLAYER_POOL_EMAIL_BRAND_MARKER
        : "";
  const next = marker ? `${marker}\n\n${cleanBody}`.trimEnd() : cleanBody;
  setTextareaValue(textarea, next);
}

function getPreviewRoot(form: HTMLFormElement) {
  return form.parentElement?.querySelector<HTMLElement>("aside") ?? document.body;
}

function updatePreviewLogo(form: HTMLFormElement, brand: BrandKey) {
  const previewRoot = getPreviewRoot(form);
  const logo = Array.from(previewRoot.querySelectorAll<HTMLImageElement>("img")).find(
    (image) =>
      image.src.includes("sixfl-email.png") ||
      image.src.includes("sixfl-tv.png") ||
      image.src.includes("Sixfl-tv.png") ||
      image.src.includes("sixfl%20player%20pool%20.png"),
  );

  if (!logo) return;

  if (brand === "sixfl-tv") {
    logo.src = SIXFL_TV_LOGO_URL;
    logo.alt = "SIXFL TV";
    logo.style.width = "220px";
    logo.width = 220;
  } else if (brand === "player-pool") {
    logo.src = PLAYER_POOL_LOGO_URL;
    logo.alt = "SIXFL Player Pool";
    logo.style.width = "300px";
    logo.width = 300;
  } else {
    logo.src = SIXFL_EMAIL_LOGO_URL;
    logo.alt = "SIXFL";
    logo.style.width = "180px";
    logo.width = 180;
  }
}

function ensureHiddenBrandInput(form: HTMLFormElement, brand: BrandKey) {
  let input = form.querySelector<HTMLInputElement>(`input[name="${HIDDEN_NAME}"]`);
  if (!input) {
    input = document.createElement("input");
    input.type = "hidden";
    input.name = HIDDEN_NAME;
    form.appendChild(input);
  }
  input.value = brand;
  return input;
}

function buttonClasses(active: boolean, tone: BrandTone) {
  const activeClasses =
    tone === "tv"
      ? "border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-50"
      : tone === "player-pool"
        ? "border-lime-400/50 bg-lime-500/15 text-lime-50"
        : "border-emerald-400/50 bg-emerald-500/15 text-emerald-50";

  return [
    "rounded-2xl border px-4 py-4 text-left transition",
    active
      ? activeClasses
      : "border-white/10 bg-white/[0.03] text-neutral-300 hover:border-white/20 hover:bg-white/[0.05]",
  ].join(" ");
}

function parseBrandKey(value: string | undefined): BrandKey {
  if (value === "sixfl-tv" || value === "player-pool") return value;
  return "sixfl";
}

function getBrandTone(brand: BrandKey): BrandTone {
  if (brand === "sixfl-tv") return "tv";
  return brand;
}

function injectBrandControl() {
  const maybeForm = getBuilderForm();
  const textarea = maybeForm?.querySelector<HTMLTextAreaElement>('textarea[name="body"]');
  if (!maybeForm || !textarea || maybeForm.querySelector(`[${CONTROL_ATTR}]`)) return;

  const form: HTMLFormElement = maybeForm;
  let brand: BrandKey = getBrandFromBody(textarea.value);
  const hiddenInput = ensureHiddenBrandInput(form, brand);

  const section = document.createElement("section");
  section.setAttribute(CONTROL_ATTR, "true");
  section.className = "rounded-3xl border border-white/10 bg-neutral-950/90 p-6";
  section.innerHTML = `
    <div class="mb-5">
      <h2 class="text-lg font-semibold text-white">Email branding</h2>
      <p class="mt-1 text-sm text-neutral-400">Choose the logo style used at the top of this email. SIXFL TV is for recorded fixture and Veo messages; Player Pool is for player recruitment and availability messages.</p>
    </div>
    <div class="grid gap-3 md:grid-cols-3">
      <button type="button" data-brand="sixfl">
        <div class="text-sm font-semibold">SIXFL</div>
        <div class="mt-2 text-xs leading-5 text-neutral-400">Use the standard SIXFL email logo.</div>
      </button>
      <button type="button" data-brand="sixfl-tv">
        <div class="text-sm font-semibold">SIXFL TV</div>
        <div class="mt-2 text-xs leading-5 text-neutral-400">Use the SIXFL TV logo for recorded match emails.</div>
      </button>
      <button type="button" data-brand="player-pool">
        <div class="text-sm font-semibold">Player Pool</div>
        <div class="mt-2 text-xs leading-5 text-neutral-400">Use the Player Pool logo for player recruitment and availability emails.</div>
      </button>
    </div>
  `;

  function refreshButtons() {
    section.querySelectorAll<HTMLButtonElement>("button[data-brand]").forEach((button) => {
      const value = parseBrandKey(button.dataset.brand);
      button.className = buttonClasses(brand === value, getBrandTone(value));
    });
    hiddenInput.value = brand;
    updatePreviewLogo(form, brand);
  }

  section.querySelectorAll<HTMLButtonElement>("button[data-brand]").forEach((button) => {
    button.addEventListener("click", () => {
      brand = parseBrandKey(button.dataset.brand);
      setBrandOnBody(textarea, brand);
      refreshButtons();
    });
  });

  textarea.addEventListener("input", () => {
    const nextBrand = getBrandFromBody(textarea.value);
    if (nextBrand !== brand) {
      brand = nextBrand;
      refreshButtons();
    }
  });

  const bodySection = textarea.closest("section");
  bodySection?.insertAdjacentElement("afterend", section);
  refreshButtons();
}

export default function EmailBrandOptionBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!isTemplateBuilderPath(pathname)) return;

    let frame = 0;
    const run = () => {
      injectBrandControl();
      frame = window.requestAnimationFrame(run);
    };

    frame = window.requestAnimationFrame(run);
    const timer = window.setTimeout(injectBrandControl, 700);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [pathname]);

  return null;
}
