// ========================================
// File: src/components/captain/CaptainOnboardingReminderBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const REMINDER_ID = "sixfl-captain-contextual-reminder";
const SIXFL_TV_NAV_LOGO_ATTR = "data-sixfl-tv-nav-logo";

type ReminderConfig = {
  eyebrow: string;
  title: string;
  body: string;
};

function getReminder(pathname: string): ReminderConfig | null {
  if (/\/captain\/team\/[^/]+\/availability(?:\/)?$/.test(pathname)) {
    return {
      eyebrow: "Avoidable admin fee",
      title: "Confirm at least 72 hours before kick-off",
      body: "We do not want to charge admin fees. The £10 late availability fee is only there for avoidable late confirmations that create extra admin, fixture chasing or rearranging work.",
    };
  }

  if (/\/captain\/team\/[^/]+\/player-payments(?:\/)?$/.test(pathname)) {
    return {
      eyebrow: "Squad payments",
      title: "Player payment links need saved email addresses",
      body: "Player payment links only work properly when each player has a valid email address saved on their squad record.",
    };
  }

  if (/\/captain\/team\/[^/]+\/payments(?:\/)?$/.test(pathname)) {
    return {
      eyebrow: "Avoidable admin fee",
      title: "Please keep team fees up to date",
      body: "We do not want to charge late payment admin fees. The £10 late payment fee is only there if a team fee is more than 7 days overdue and SIXFL has to spend extra time chasing it.",
    };
  }

  return null;
}

function createReminderElement(config: ReminderConfig) {
  const wrapper = document.createElement("section");
  wrapper.id = REMINDER_ID;
  wrapper.className =
    "mb-6 rounded-3xl border border-emerald-400/20 bg-emerald-500/10 px-5 py-4 text-emerald-50 shadow-[0_18px_60px_rgba(0,0,0,0.22)]";

  const eyebrow = document.createElement("p");
  eyebrow.className =
    "text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70";
  eyebrow.textContent = config.eyebrow;

  const title = document.createElement("h2");
  title.className = "mt-2 text-lg font-semibold text-white";
  title.textContent = config.title;

  const body = document.createElement("p");
  body.className =
    "mt-2 max-w-4xl text-sm leading-6 text-emerald-50/78";
  body.textContent = config.body;

  wrapper.append(eyebrow, title, body);
  return wrapper;
}

function decorateSixflTvNav() {
  const links = document.querySelectorAll<HTMLAnchorElement>(
    '.captain-team-nav a[href*="/captain/team/"][href*="/tv"]',
  );

  for (const link of links) {
    if (link.getAttribute(SIXFL_TV_NAV_LOGO_ATTR) === "true") continue;

    link.textContent = "";
    link.setAttribute(SIXFL_TV_NAV_LOGO_ATTR, "true");
    link.setAttribute("aria-label", "SIXFL TV");
    link.setAttribute("title", "SIXFL TV");

    const image = document.createElement("img");
    image.src = "/Sixfl-tv.png";
    image.alt = "SIXFL TV";
    image.className = "h-5 w-auto max-w-[6.5rem] object-contain";

    link.appendChild(image);
  }
}

export default function CaptainOnboardingReminderBridge() {
  const pathname = usePathname();

  useEffect(() => {
    const existing = document.getElementById(REMINDER_ID);
    existing?.remove();

    decorateSixflTvNav();
    const frame = window.requestAnimationFrame(decorateSixflTvNav);
    const observer = new MutationObserver(decorateSixflTvNav);
    const header = document.querySelector(".captain-team-header");
    if (header) {
      observer.observe(header, {
        childList: true,
        subtree: true,
        attributes: true,
      });
    }

    const reminder = getReminder(pathname);
    if (reminder) {
      const main = document.querySelector(".captain-team-main");
      if (main) main.prepend(createReminderElement(reminder));
    }

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      document.getElementById(REMINDER_ID)?.remove();
    };
  }, [pathname]);

  return null;
}
