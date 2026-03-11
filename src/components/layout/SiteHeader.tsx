// ========================================
// File: src/components/SiteHeader.tsx
// ========================================

"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
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
  const { data: session } = useSession();

  const isAdmin = session?.user?.email === "mathewcobley1@gmail.com";

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-colors duration-300 ${
        scrolled
          ? "border-white/10 bg-black/85 backdrop-blur-xl"
          : "border-white/5 bg-black/60 backdrop-blur-xl"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex shrink-0 items-center">
          <Image
            src="/logo2.png"
            alt="SIXFL"
            width={180}
            height={48}
            priority
            sizes="(max-width: 768px) 132px, 180px"
            className="h-[28px] w-auto object-contain sm:h-[34px]"
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-5 text-[13px] font-medium md:flex">
          <a
            href="mailto:hello@sixfl.co.uk"
            className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-[11px] font-semibold tracking-wide text-white transition hover:bg-white/10"
          >
            Contact
          </a>

          <NavLink href="/login">Login</NavLink>

          {isAdmin && <NavLink href="/admin">Admin</NavLink>}

          <Link
            href="/register"
            className="rounded-full bg-emerald-500 px-3.5 py-1.5 text-[11px] font-extrabold tracking-wide text-black transition hover:bg-emerald-400"
          >
            Register
          </Link>
        </nav>

        {/* Mobile nav */}
        <div className="flex items-center gap-2 md:hidden">
          <a
            href="mailto:hello@sixfl.co.uk"
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-white/10"
          >
            Contact
          </a>

          <Link
            href="/login"
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-white/10"
          >
            Login
          </Link>

          {isAdmin && (
            <Link
              href="/admin"
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-white/10"
            >
              Admin
            </Link>
          )}

          <Link
            href="/register"
            className="rounded-full bg-emerald-500 px-3 py-1.5 text-[11px] font-extrabold text-black transition hover:bg-emerald-400"
          >
            Register
          </Link>
        </div>
      </div>
    </header>
  );
}