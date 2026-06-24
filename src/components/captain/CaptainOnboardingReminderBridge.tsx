// ========================================
// File: src/components/captain/CaptainOnboardingReminderBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const REMINDER_ID = "sixfl-captain-contextual-reminder";

type ReminderConfig = {
  eyebrow: string;
  title: string;
  body: string;
};

function getReminder(pathname: string): ReminderConfig | null {
  if (/\/captain\/team\/[^/]+\/availability(?:\/)?$/.test(pathname)) {
    return {
      eyebrow: "Availability rule",
      title: "Confirm at least 72 hours before kick-off",
      body: "Availability must be confirmed at least 72 hours before kick-off. Late confirmation may affect your fixture or lead to an admin fee.",
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
      eyebrow: "Payment reminder",
      title: "Late fees may apply after 7 days",
      body: "Team fees should be paid on time. Fees more than 7 days overdue may incur a £10 admin fee.",
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
  eyebrow.className = "text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70";
  eyebrow.textContent = config.eyebrow;

  const title = document.createElement("h2");
  title.className = "mt-2 text-lg font-semibold text-white";
  title.textContent = config.title;

  const body = document.createElement("p");
  body.className = "mt-2 max-w-4xl text-sm leading-6 text-emerald-50/78";
  body.textContent = config.body;

  wrapper.append(eyebrow, title, body);
  return wrapper;
}

export default function CaptainOnboardingReminderBridge() {
  const pathname = usePathname();

  useEffect(() => {
    const existing = document.getElementById(REMINDER_ID);
    existing?.remove();

    const reminder = getReminder(pathname);
    if (!reminder) return;

    const main = document.querySelector(".captain-team-main");
    if (!main) return;

    main.prepend(createReminderElement(reminder));

    return () => {
      document.getElementById(REMINDER_ID)?.remove();
    };
  }, [pathname]);

  return null;
}
