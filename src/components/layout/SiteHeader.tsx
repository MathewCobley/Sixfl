"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

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
        className={`absolute left-0 -bottom-1 h-[2px] w-full bg-emerald-400 transition-all duration-300 ${
          active ? "opacity-100" : "opacity-0"
        }`}
      />
    </Link>
  );
}

export default function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 backdrop-blur-xl border-b border-white/5 shadow-[0_2px_20px_rgba(0,255,150,0.05)] transition-all duration-300 ${
        scrolled ? "bg-black/80 py-2" : "bg-black/60 py-3"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center">
          <Image
            src="/logo2.png"
            alt="SIXFL"
            width={180}
            height={48}
            priority
            sizes="(max-width: 768px) 140px, 180px"
            className={`w-auto object-contain transition-all duration-300 ${
              scrolled ? "h-[30px]" : "h-[34px]"
            }`}
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-5 text-[13px] font-medium md:flex">
          {/* Contact */}
          <a
            href="mailto:hello@sixfl.co.uk"
            className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-[11px] font-semibold tracking-wide text-white hover:bg-white/10 transition"
          >
            Contact
          </a>

          {/* Login (text link) */}
          <NavLink href="/login">Login</NavLink>

          {/* Register (primary button) */}
          <Link
            href="/register"
            className="rounded-full bg-emerald-500 px-3.5 py-1.5 text-[11px] font-extrabold tracking-wide text-black hover:bg-emerald-400 transition"
          >
            Register
          </Link>
        </nav>

        {/* Mobile */}
        <div className="flex items-center gap-2 md:hidden">
          <a
            href="mailto:hello@sixfl.co.uk"
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/10 transition"
          >
            Contact
          </a>

          <Link
            href="/login"
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/10 transition"
          >
            Login
          </Link>

          <Link
            href="/register"
            className="rounded-full bg-emerald-500 px-3 py-1.5 text-[11px] font-extrabold text-black hover:bg-emerald-400 transition"
          >
            Register
          </Link>
        </div>
      </div>
    </header>
  );
}