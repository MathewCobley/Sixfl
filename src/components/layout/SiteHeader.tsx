// ========================================
// File: src/components/layout/SiteHeader.tsx
// ========================================

"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { HiOutlineMenu, HiOutlineX } from "react-icons/hi";
import { track } from "@vercel/analytics";

const SUPER_ADMINS = [
  "hello@sixfl.co.uk",
  "mathew@sixfl.co.uk",
  "mathewcobley1@gmail.com",
];

type HeaderVariant = "public" | "admin";

type SiteHeaderProps = {
  variant?: HeaderVariant;
};

type NavItem = {
  href: string;
  label: string;
  trackLabel: string;
};

function NavLink({
  href,
  children,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href;

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

export default function SiteHeader({
  variant = "public",
}: SiteHeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const { data: session } = useSession();

  const email = session?.user?.email?.toLowerCase().trim() ?? "";
  const isAdmin = SUPER_ADMINS.includes(email);

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

  const navItems = useMemo<NavItem[]>(() => {
    if (variant === "admin") {
      return [
        { href: "/admin", label: "Overview", trackLabel: "Overview" },
        { href: "/admin/teams", label: "Teams", trackLabel: "Teams" },
        { href: "/admin/leagues", label: "Leagues", trackLabel: "Leagues" },
        { href: "/admin/fixtures", label: "Fixtures", trackLabel: "Fixtures" },
        { href: "/admin/leads", label: "Leads", trackLabel: "Leads" },
      ];
    }

    return [
      { href: "/faq", label: "FAQ", trackLabel: "FAQ" },
      { href: "/login", label: "Login", trackLabel: "Login" },
    ];
  }, [variant]);

  const showAdminShortcutInPublic = variant === "public" && isAdmin;

  const primaryCta =
    variant === "admin"
      ? {
          href: "/",
          label: "View site",
          trackEvent: "header_admin_cta_click",
          type: "site",
        }
      : {
          href: "/register-interest?type=team",
          label: "Register Interest",
          trackEvent: "header_cta_click",
          type: "team",
        };

  const secondaryPublicLink =
    variant === "public"
      ? {
          href: "/contact",
          label: "Contact",
        }
      : null;

  const headerLabel =
    variant === "admin" ? "SIXFL Admin" : "SIXFL – 6-a-side football";

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
          className={`mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 transition-all duration-300 sm:px-6 lg:px-8 ${
            scrolled ? "h-14" : "h-16"
          }`}
        >
          <div className="flex min-w-0 items-center gap-4">
            <Link
              href={variant === "admin" ? "/admin" : "/"}
              className="flex min-w-0 shrink-0 items-center"
              onClick={() =>
                track("header_nav_click", {
                  location: `${variant}_header`,
                  target: variant === "admin" ? "/admin" : "/",
                  label: "logo",
                })
              }
            >
              <Image
                src="/logo2.png"
                alt="SIXFL"
                width={180}
                height={48}
                priority
                sizes="(max-width: 768px) 132px, 180px"
                className={`w-auto object-contain transition-all duration-300 ${
                  scrolled ? "h-[24px] sm:h-[30px]" : "h-[28px] sm:h-[34px]"
                }`}
              />
            </Link>

            {variant === "admin" && (
              <div className="hidden border-l border-white/10 pl-4 lg:block">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
                  {headerLabel}
                </div>
              </div>
            )}
          </div>

          <nav className="hidden items-center gap-5 text-[13px] font-medium md:flex">
            {secondaryPublicLink && (
              <Link
                href={secondaryPublicLink.href}
                onClick={() =>
                  track("header_nav_click", {
                    location: "desktop_header",
                    target: secondaryPublicLink.href,
                    label: secondaryPublicLink.label,
                  })
                }
                className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-[11px] font-semibold tracking-wide text-white transition hover:bg-white/10"
              >
                {secondaryPublicLink.label}
              </Link>
            )}

            {navItems.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                onClick={() =>
                  track("header_nav_click", {
                    location: "desktop_header",
                    target: item.href,
                    label: item.trackLabel,
                    variant,
                  })
                }
              >
                {item.label}
              </NavLink>
            ))}

            {showAdminShortcutInPublic && (
              <NavLink
                href="/admin"
                onClick={() =>
                  track("header_nav_click", {
                    location: "desktop_header",
                    target: "/admin",
                    label: "Admin",
                    variant,
                  })
                }
              >
                Admin
              </NavLink>
            )}

            <Link
              href={primaryCta.href}
              onClick={() =>
                track(primaryCta.trackEvent, {
                  location: "desktop_header",
                  target: primaryCta.href,
                  label: primaryCta.label,
                  variant,
                  type: primaryCta.type,
                })
              }
              className="rounded-full bg-emerald-500 px-4 py-2 text-[12px] font-extrabold tracking-wide text-black shadow-lg shadow-emerald-500/20 transition hover:-translate-y-[1px] hover:bg-emerald-400"
            >
              {primaryCta.label}
            </Link>
          </nav>

          <div className="flex items-center gap-2 md:hidden">
            <Link
              href={primaryCta.href}
              onClick={() =>
                track(primaryCta.trackEvent, {
                  location: "mobile_header",
                  target: primaryCta.href,
                  label: primaryCta.label,
                  variant,
                  type: primaryCta.type,
                })
              }
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-3 text-[11px] font-extrabold whitespace-nowrap text-black transition hover:bg-emerald-400"
            >
              {primaryCta.label}
            </Link>

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

      {mobileMenuOpen && (
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
      )}

      <div
        className={`fixed right-0 top-0 z-50 h-full w-[88vw] max-w-sm border-l border-white/10 bg-black text-white shadow-2xl transition-transform duration-300 md:hidden ${
          mobileMenuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="h-[2px] w-full bg-emerald-500" />

        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
              {variant === "admin" ? "Admin menu" : "Menu"}
            </div>
            {variant === "admin" && (
              <div className="mt-1 text-xs text-emerald-400">{headerLabel}</div>
            )}
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
            {secondaryPublicLink && (
              <Link
                href={secondaryPublicLink.href}
                onClick={() => {
                  track("header_nav_click", {
                    location: "mobile_menu",
                    target: secondaryPublicLink.href,
                    label: secondaryPublicLink.label,
                    variant,
                  });
                  setMobileMenuOpen(false);
                }}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-emerald-400 hover:bg-white/10"
              >
                <span>{secondaryPublicLink.label}</span>
                <span className="text-white/40">→</span>
              </Link>
            )}

            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  track("header_nav_click", {
                    location: "mobile_menu",
                    target: item.href,
                    label: item.trackLabel,
                    variant,
                  });
                  setMobileMenuOpen(false);
                }}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-emerald-400 hover:bg-white/10"
              >
                <span>{item.label}</span>
                <span className="text-white/40">→</span>
              </Link>
            ))}

            {showAdminShortcutInPublic && (
              <Link
                href="/admin"
                onClick={() => {
                  track("header_nav_click", {
                    location: "mobile_menu",
                    target: "/admin",
                    label: "Admin",
                    variant,
                  });
                  setMobileMenuOpen(false);
                }}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-emerald-400 hover:bg-white/10"
              >
                <span>Admin</span>
                <span className="text-white/40">→</span>
              </Link>
            )}
          </div>

          <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
              {variant === "admin" ? "Quick action" : "Start here"}
            </div>

            <p className="mt-2 text-sm leading-6 text-white/70">
              {variant === "admin"
                ? "Jump back to the public site while keeping the same SIXFL header system."
                : "Join the waiting list and be first to hear when new SIXFL leagues open."}
            </p>

            <Link
              href={primaryCta.href}
              onClick={() => {
                track(primaryCta.trackEvent, {
                  location: "mobile_menu",
                  target: primaryCta.href,
                  label: primaryCta.label,
                  variant,
                  type: primaryCta.type,
                });
                setMobileMenuOpen(false);
              }}
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full bg-emerald-500 px-4 text-sm font-extrabold uppercase tracking-wide text-black transition hover:bg-emerald-400"
            >
              {primaryCta.label}
            </Link>
          </div>

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