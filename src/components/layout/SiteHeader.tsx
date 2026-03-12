// ========================================
// File: src/components/layout/SiteHeader.tsx
// ========================================

"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { HiOutlineMenu, HiOutlineX } from "react-icons/hi";

const SUPER_ADMINS = [
  "hello@sixfl.co.uk",
  "mathew@sixfl.co.uk",
  "mathewcobley1@gmail.com",
];

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

export default function SiteHeader() {
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

  return (
    <>
      <header
        className={`sticky top-0 z-50 border-b transition-all duration-300 ${
          scrolled
            ? "border-white/10 bg-black/90 backdrop-blur-xl"
            : "border-white/5 bg-black/75 backdrop-blur-xl"
        }`}
      >
        {/* Emerald accent line */}
        <div className="h-[2px] w-full bg-emerald-500" />

        <div
          className={`mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 transition-all duration-300 ${
            scrolled ? "h-14" : "h-16"
          }`}
        >
          {/* Logo */}
          <Link href="/" className="flex min-w-0 shrink-0 items-center">
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

          {/* Desktop navigation */}
          <nav className="hidden items-center gap-5 text-[13px] font-medium md:flex">
            <Link
              href="/contact"
              className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-[11px] font-semibold tracking-wide text-white transition hover:bg-white/10"
            >
              Contact
            </Link>

            <NavLink href="/faq">FAQ</NavLink>
            <NavLink href="/login">Login</NavLink>

            {isAdmin && <NavLink href="/admin">Admin</NavLink>}

            <Link
              href="/register-interest?type=team"
              className="rounded-full bg-emerald-500 px-4 py-2 text-[12px] font-extrabold tracking-wide text-black shadow-lg shadow-emerald-500/20 transition hover:-translate-y-[1px] hover:bg-emerald-400"
            >
              Register interest
            </Link>
          </nav>

          {/* Mobile actions */}
          <div className="flex items-center gap-2 md:hidden">
            <Link
              href="/register-interest?type=team"
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-3 text-[11px] font-extrabold whitespace-nowrap text-black transition hover:bg-emerald-400"
            >
              Register interest
            </Link>

            <button
              type="button"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((open) => !open)}
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

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile menu panel */}
      <div
        className={`fixed right-0 top-0 z-50 h-full w-[88vw] max-w-sm border-l border-white/10 bg-black text-white shadow-2xl transition-transform duration-300 md:hidden ${
          mobileMenuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="h-[2px] w-full bg-emerald-500" />

        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
            Menu
          </div>

          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileMenuOpen(false)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
          >
            <HiOutlineX className="h-5 w-5" />
          </button>
        </div>

        <div className="flex h-[calc(100%-66px)] flex-col overflow-y-auto px-4 py-6">
          <div className="space-y-2">
            <Link
              href="/login"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-emerald-400 hover:bg-white/10"
            >
              <span>Login</span>
              <span className="text-white/40">→</span>
            </Link>

            <Link
              href="/contact"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-emerald-400 hover:bg-white/10"
            >
              <span>Contact</span>
              <span className="text-white/40">→</span>
            </Link>

            <Link
              href="/faq"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-emerald-400 hover:bg-white/10"
            >
              <span>FAQ</span>
              <span className="text-white/40">→</span>
            </Link>

            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-emerald-400 hover:bg-white/10"
              >
                <span>Admin</span>
                <span className="text-white/40">→</span>
              </Link>
            )}
          </div>

          <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
              Start here
            </div>

            <p className="mt-2 text-sm leading-6 text-white/70">
              Join the waiting list and be first to hear when new SIXFL leagues
              open.
            </p>

            <Link
              href="/register-interest?type=team"
              onClick={() => setMobileMenuOpen(false)}
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full bg-emerald-500 px-4 text-sm font-extrabold uppercase tracking-wide text-black transition hover:bg-emerald-400"
            >
              Register interest
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