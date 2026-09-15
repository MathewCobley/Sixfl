import Link from "next/link";

export default function AdminKitsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <div className="mx-auto flex max-w-[1500px] flex-wrap gap-2 px-4 pt-4 sm:px-6 lg:px-8">
        <Link
          href="/admin/kits"
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-semibold text-white/75 transition hover:bg-white/[0.08]"
        >
          Kits
        </Link>
        <Link
          href="/admin/kits/payment-links"
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
        >
          Payment links
        </Link>
      </div>
      {children}
    </>
  );
}
