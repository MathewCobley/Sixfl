import Link from "next/link";

export default function SiteHeader() {
  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-xl font-semibold tracking-tight">
          SIXFL
        </Link>

        <nav className="flex items-center gap-6 text-sm">
          <Link className="hover:underline" href="/leagues">
            Leagues
          </Link>
          <Link className="hover:underline" href="/venues">
            Venues
          </Link>
          <Link className="hover:underline" href="/pricing">
            Pricing
          </Link>
          <Link
            className="rounded-md border px-3 py-1.5 hover:bg-black hover:text-white"
            href="/contact"
          >
            Register
          </Link>
        </nav>
      </div>
    </header>
  );
}