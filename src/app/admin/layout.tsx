import Link from "next/link";
import { requireAdmin } from "@/lib/requireAdmin";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireAdmin();

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 bg-black/20">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="font-semibold">
              Admin Console
            </Link>

            <nav className="flex items-center gap-4 text-sm">
              <Link href="/admin/teams" className="hover:underline">
                Teams
              </Link>

              <Link href="/admin/fixtures" className="hover:underline">
                Fixtures
              </Link>

              <Link href="/admin/results" className="hover:underline">
                Results
              </Link>

              <Link href="/dashboard" className="hover:underline">
                Back to Dashboard
              </Link>
            </nav>
          </div>

          <div className="text-sm text-white/70">
            Signed in as{" "}
            <span className="font-medium text-white">{user.email}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}