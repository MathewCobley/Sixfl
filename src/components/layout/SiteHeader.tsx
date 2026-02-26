import Link from "next/link";
import Image from "next/image";

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center">
          <Image
            src="/logo2.png"              // ✅ use your real logo (or /x.png if you prefer)
            alt="SIXFL"
            width={180}
            height={48}
            className="h-7 w-auto object-contain hover:opacity-80 transition"
            priority
          />
        </Link>

        <nav className="flex items-center gap-6 text-sm font-medium text-white/85">
          <Link className="hover:text-white transition" href="/leagues">
            Leagues
          </Link>
          <Link className="hover:text-white transition" href="/venues">
            Venues
          </Link>
          <Link className="hover:text-white transition" href="/pricing">
            Pricing
          </Link>

          {/* ✅ Contact in header */}
          <a
            className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold tracking-wide text-white hover:bg-white/10 transition"
            href="mailto:hello@sixfl.co.uk"
          >
            Contact
          </a>

          {/* ✅ Register button links to register */}
          <Link
            className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-extrabold tracking-wide text-black hover:bg-emerald-400 transition"
            href="/register"
          >
            Register
          </Link>
        </nav>
      </div>
    </header>
  );
}