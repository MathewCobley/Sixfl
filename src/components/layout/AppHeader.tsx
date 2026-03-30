// ========================================
// File: src/components/layout/AppHeader.tsx
// ========================================

"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { HiOutlineMenu, HiOutlineX } from "react-icons/hi";
import { track } from "@vercel/analytics";

type HeaderVariant = "public" | "admin";

type HeaderLink = {
  label: string;
  href: string;
  pill?: boolean;
};

type HeaderAction = {
  label: string;
  href: string;
  eventLabel: string;
  tone?: "primary" | "secondary";
};

const SUPER_ADMINS = [
  "hello@sixfl.co.uk",
  "mathew@sixfl.co.uk",
  "mathewcobley1@gmail.com",
];

function NavLink({
  href,
  children,
  onClick,
  activeMode = "underline",
}: {
  href: string;
  children: React.ReactNode;
  onClick?: () => void;
  activeMode?: "underline" | "pill";
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  if (activeMode === "pill") {
    return (
      <Link
        href={href}
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        className={[
          "rounded-full px-4 py-2 text-sm font-medium transition",
          active
            ? "bg-emerald-500/15 text-emerald-300"
            : "text-white/75 hover:bg-white/5 hover:text-white",
        ].join(" ")}
      >
        {children}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`relative transition-colors duration-200 ${
        active ? "text-white" : "text-white/80 hover:text-white"
      }`}
    >
      {children}
      <span
        className={`absolute left-0 -bottom-1 h-[2px] w-full bg-emerald-400 transition-opacity duration-300 ${
          active ? "opacity-100" : "opacity-0"
        }`}
      />
    </Link>
  );
}

function getHeaderConfig(variant: HeaderVariant, isAdmin: boolean) {
  if (variant === "admin") {
    return {
      containerClassName:
        "mx-auto flex w-full max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8",
      desktopNavClassName: "hidden items-center gap-2 xl:flex",
      mobilePanelTitle: "Admin",
      links: [
        { label: "Overview", href: "/admin" },
        { label: "Teams", href: "/admin/teams" },
        { label: "Leagues", href: "/admin/leagues" },
        { label: "Fixtures", href: "/admin/fixtures" },
        { label: "Leads", href: "/admin/leads" },
        { label: "Messaging", href: "/admin/messaging" },
      ] satisfies HeaderLink[],
      actions: [
        {
          label: "Public site",
          href: "/",
          eventLabel: "Public site",
          tone: "secondary",
        },
      ] satisfies HeaderAction[],
      logoHref: "/admin",
      logoSrc: "/logo2.png",
      logoAlt: "SIXFL Admin",
      navMode: "pill" as const,
    };
  }

  const publicLinks: HeaderLink[] = [
    { label: "Contact", href: "/contact", pill: true },
    { label: "FAQ", href: "/faq" },
    { label: "Login", href: "/login" },
  ];

  if (isAdmin) {
    publicLinks.push({ label: "Admin", href: "/admin" });
  }

  return {
    containerClassName:
      "mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4",
    desktopNavClassName:
      "hidden items-center gap-5 text-[13px] font-medium md:flex",
    mobilePanelTitle: "Menu",
    links: publicLinks,
    actions: [
      {
        label: "Register Interest",
        href: "/register-interest?type=team",
        eventLabel: "Register Interest",
        tone: "primary",
      },
    ] satisfies HeaderAction[],
    logoHref: "/",
    logoSrc: "/logo2.png",
    logoAlt: "SIXFL",
    navMode: "underline" as const,
  };
}

export default function AppHeader({
  variant,
}: {
  variant: HeaderVariant;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const pathname = usePathname();
  const { data: session } = useSession();

  const email = session?.user?.email?.toLowerCase().trim() ?? "";
  const isAdmin = SUPER_ADMINS.includes(email);

  const config = useMemo(
    () => getHeaderConfig(variant, isAdmin),
    [variant, isAdmin]
  );

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  return (
    <>
      <header
        className={`sticky top-0 z-50 border-b transition-all duration-300 ${
          scrolled
            ? "border-white/10 bg-black/90 backdrop-blur-xl"
            : "border-white/5 bg-black/75 backdrop-blur-xl"
        }`}
      >
        <div className="h-[2px] w-full bg-emerald-500" />

        <div
          className={`${config.containerClassName} transition-all duration-300 ${
            scrolled ? "h-14" : "h-16"
          }`}
        >
          <Link
            href={config.logoHref}
            className="flex min-w-0 shrink-0 items-center"
            onClick={() =>
              track("header_nav_click", {
                location: `${variant}_header`,
                target: config.logoHref,
                label: "logo",
              })
            }
          >
            <Image
              src={config.logoSrc}
              alt={config.logoAlt}
              width={180}
              height={48}
              priority
              sizes="(max-width: 768px) 132px, 180px"
              className={`w-auto object-contain transition-all duration-300 ${
                scrolled ? "h-[24px] sm:h-[30px]" : "h-[28px] sm:h-[34px]"
              }`}
            />
          </Link>

          <nav className={config.desktopNavClassName}>
            {config.links.map((link) =>
              link.pill ? (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() =>
                    track("header_nav_click", {
                      location: `${variant}_desktop_header`,
                      target: link.href,
                      label: link.label,
                    })
                  }
                  className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-[11px] font-semibold tracking-wide text-white transition hover:bg-white/10"
                >
                  {link.label}
                </Link>
              ) : (
                <NavLink
                  key={link.href}
                  href={link.href}
                  activeMode={config.navMode}
                  onClick={() =>
                    track("header_nav_click", {
                      location: `${variant}_desktop_header`,
                      target: link.href,
                      label: link.label,
                    })
                  }
                >
                  {link.label}
                </NavLink>
              )
            )}

            {config.actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                onClick={() =>
                  track("header_cta_click", {
                    location: `${variant}_desktop_header`,
                    target: action.href,
                    label: action.eventLabel,
                  })
                }
                className={[
                  "rounded-full px-4 py-2 text-[12px] font-extrabold tracking-wide transition",
                  action.tone === "primary"
                    ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20 hover:-translate-y-[1px] hover:bg-emerald-400"
                    : "border border-white/10 bg-white/5 text-white hover:bg-white/10",
                ].join(" ")}
              >
                {action.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2 md:hidden">
            {config.actions[0] ? (
              <Link
                href={config.actions[0].href}
                onClick={() =>
                  track("header_cta_click", {
                    location: `${variant}_mobile_header`,
                    target: config.actions[0].href,
                    label: config.actions[0].eventLabel,
                  })
                }
                className={[
                  "inline-flex h-9 shrink-0 items-center justify-center rounded-full px-3 text-[11px] font-extrabold whitespace-nowrap transition",
                  config.actions[0].tone === "primary"
                    ? "bg-emerald-500 text-black hover:bg-emerald-400"
                    : "border border-white/10 bg-white/5 text-white hover:bg-white/10",
                ].join(" ")}
              >
                {config.actions[0].label}
              </Link>
            ) : null}

            <button
              type="button"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
              onClick={() => {
                track("mobile_menu_toggle", {
                  action: mobileMenuOpen ? "close" : "open",
                  location: `${variant}_header`,
                });
                setMobileMenuOpen((open) => !open);
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
            >
              {mobileMenuOpen ? (
                <HiOutlineX className="h-5 w-5" />
              ) : (
                <HiOutlineMenu className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      </header>

      {mobileMenuOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden"
          onClick={() => {
            track("mobile_menu_toggle", {
              action: "close_overlay",
              location: `${variant}_header`,
            });
            setMobileMenuOpen(false);
          }}
        />
      ) : null}

      <div
        className={`fixed right-0 top-0 z-50 h-full w-[88vw] max-w-sm border-l border-white/10 bg-black text-white shadow-2xl transition-transform duration-300 md:hidden ${
          mobileMenuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="h-[2px] w-full bg-emerald-500" />

        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
            {config.mobilePanelTitle}
          </div>

          <button
            type="button"
            aria-label="Close menu"
            onClick={() => {
              track("mobile_menu_toggle", {
                action: "close_button",
                location: `${variant}_header`,
              });
              setMobileMenuOpen(false);
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
          >
            <HiOutlineX className="h-5 w-5" />
          </button>
        </div>

        <div className="flex h-[calc(100%-66px)] flex-col overflow-y-auto px-4 py-6">
          <div className="space-y-2">
            {config.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => {
                  track("header_nav_click", {
                    location: `${variant}_mobile_menu`,
                    target: link.href,
                    label: link.label,
                  });
                  setMobileMenuOpen(false);
                }}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-emerald-400 hover:bg-white/10"
              >
                <span>{link.label}</span>
                <span className="text-white/40">→</span>
              </Link>
            ))}
          </div>

          {config.actions[0] ? (
            <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
                {variant === "admin" ? "Quick action" : "Start here"}
              </div>

              <p className="mt-2 text-sm leading-6 text-white/70">
                {variant === "admin"
                  ? "Switch back to the public-facing SIXFL site while keeping the admin shell separate."
                  : "Join the waiting list and be first to hear when new SIXFL leagues open."}
              </p>

              <Link
                href={config.actions[0].href}
                onClick={() => {
                  track("header_cta_click", {
                    location: `${variant}_mobile_menu`,
                    target: config.actions[0].href,
                    label: config.actions[0].eventLabel,
                  });
                  setMobileMenuOpen(false);
                }}
                className={[
                  "mt-4 inline-flex h-11 w-full items-center justify-center rounded-full px-4 text-sm font-extrabold uppercase tracking-wide transition",
                  config.actions[0].tone === "primary"
                    ? "bg-emerald-500 text-black hover:bg-emerald-400"
                    : "border border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]",
                ].join(" ")}
              >
                {config.actions[0].label}
              </Link>
            </div>
          ) : null}

          <div className="mt-auto pt-8">
            <div className="border-t border-white/10 pt-4 text-xs text-white/45">
              6-a-side football. Done properly.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}