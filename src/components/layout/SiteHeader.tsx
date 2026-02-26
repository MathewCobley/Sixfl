import Link from "next/link";
import Image from "next/image";

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        {/* Logo */}
        <Link href="/" className="flex items-center">
          <Image
            src="/logo2.png" // no-tagline logo
            alt="SIXFL"
            width={180}
            height={48}
            priority
            sizes="(max-width: 768px) 140px, 180px"
            className="h-7 w-auto object-contain"
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 text-sm font-medium text-white/85 md:flex">
          <Link className="hover:text-white transition" href="/leagues">
            Leagues
          </Link>
          <Link className="hover:text-white transition" href="/venues">
            Venues
          </Link>
          <Link className="hover:text-white transition" href="/pricing">
            Pricing
          </Link>

          <a
            href="mailto:hello@sixfl.co.uk"
            className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold tracking-wide text-white hover:bg-white/10 transition"
          >
            Contact
          </a>

          <Link
            className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-extrabold tracking-wide text-black hover:bg-emerald-400 transition"
            href="/register"
          >
            Register
          </Link>
        </nav>

        {/* Mobile actions (no overflow) */}
        <div className="flex items-center gap-2 md:hidden">
          <a
            href="mailto:hello@sixfl.co.uk"
            className="rounded-full border border-white/15 bg-white/5 px-3 py-2 text-[11px] font-semibold tracking-wide text-white hover:bg-white/10 transition"
          >
            Contact
          </a>

          <Link
            className="rounded-full bg-emerald-500 px-3 py-2 text-[11px] font-extrabold tracking-wide text-black hover:bg-emerald-400 transition"
            href="/register"
          >
            Register
          </Link>
        </div>
      </div>
    </header>
  );
}