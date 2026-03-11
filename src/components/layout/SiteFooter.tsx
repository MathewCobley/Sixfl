// ========================================
// File: src/components/layout/SiteFooter.tsx
// ========================================

import Link from "next/link";
import { FaFacebook } from "react-icons/fa";

export default function SiteFooter() {
  return (
    <footer className="border-t bg-white">
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-gray-600">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="font-medium text-gray-900">SIXFL</div>
              <div className="mt-1">6-a-side football. Done properly.</div>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <Link className="hover:underline" href="/leagues">
                Leagues
              </Link>
              <Link className="hover:underline" href="/venues">
                Venues
              </Link>
              <Link className="hover:underline" href="/pricing">
                Pricing
              </Link>
              <Link className="hover:underline" href="/faq">
                FAQ
              </Link>
              <Link className="hover:underline" href="/register">
                Register
              </Link>

              <a
                className="flex items-center gap-2 hover:underline"
                href="https://www.facebook.com/profile.php?id=61588172021259"
                target="_blank"
                rel="noopener noreferrer"
              >
                <FaFacebook className="text-blue-600 text-lg" />
                Facebook
              </a>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-5">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
              Legal
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-5 text-sm">
              <Link className="hover:underline" href="/league-rules">
                League Rules
              </Link>
              <Link className="hover:underline" href="/league-agreement">
                League Agreement
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-8 text-xs text-gray-500">
          © {new Date().getFullYear()} SIXFL. All rights reserved.
        </div>
      </div>
    </footer>
  );
}