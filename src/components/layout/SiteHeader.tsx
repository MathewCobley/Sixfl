import Link from "next/link";
import Image from "next/image";

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center">
          <Image
            src="/icon.png"
            alt="SIXFL"
            width={64}
            height={64}
            className="h-6 w-auto object-contain hover:opacity-80 transition"
            priority
          />
        </Link>

        <nav className="flex items-center gap-6 text-sm font-medium text-white/85">
          <Link className="hover:text-white transition" href="/leagues">Leagues</Link>
          <Link className="hover:text-white transition" href="/venues">Venues</Link>
          <Link className="hover:text-white transition" href="/pricing">Pricing</Link>
          <Link
            className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold tracking-wide text-white hover:bg-white/10 transition"
            href="/contact"
          >
            Register
          </Link>
        </nav>
      </div>
    </header>
  );
}