// ========================================
// File: src/components/layout/header/header-config.ts
// ========================================

import type { HeaderConfig, HeaderVariant } from "./types";

export function getHeaderConfig(variant: HeaderVariant): HeaderConfig {
  if (variant === "admin") {
    return {
      variant: "admin",
      links: [
        { label: "Overview", href: "/admin" },
        { label: "Teams", href: "/admin/teams" },
        { label: "Leagues", href: "/admin/leagues" },
        { label: "Fixtures", href: "/admin/fixtures" },
        { label: "Leads", href: "/admin/leads" },
        { label: "Messaging", href: "/admin/messaging" },
      ],
      primaryAction: {
        label: "Public site",
        href: "/",
        tone: "default",
      },
      showAuthLinks: false,
      showAdminLink: false,
      containerClassName: "mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8",
    };
  }

  return {
    variant: "public",
    links: [
      { label: "Contact", href: "/contact" },
      { label: "FAQ", href: "/faq" },
    ],
    primaryAction: {
      label: "Register Interest",
      href: "/register-interest",
      tone: "primary",
    },
    showAuthLinks: true,
    showAdminLink: true,
    containerClassName: "mx-auto w-full max-w-6xl px-4",
  };
}