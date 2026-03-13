// ========================================
// File: src/components/layout/SiteFooter.tsx
// ========================================

"use client";

import Image from "next/image";
import Link from "next/link";
import { FaFacebookF, FaInstagram } from "react-icons/fa";
import { track } from "@vercel/analytics";

export default function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-black text-white">
      {/* Emerald accent line */}
      <div className="h-[3px] w-full bg-emerald-500"></div>

      <div className="mx-auto max-w-6xl px-4 py-12">
        {/* Now 4 columns instead of 3 */}
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          {/* Brand / CTA */}
          <div className="max-w-md">
            <Link href="/" className="inline-flex items-center">
              <Image
                src="/logo2.png"
                alt="SIXFL"
                width={200}
                height={60}
                className="h-auto w-auto"
              />
            </Link>

            <p className="mt-4 text-sm leading-6 text-white/70">
              Premium 6-a-side football leagues with proper organisation,
              fixtures, results, tables and matchnight management.
            </p>

            <div className="mt-6">
              <Link
                href="/register-team"
                onClick={() =>
                  track("footer_cta_click", {
                    location: "footer",
                    target: "/register-team",
                    label: "Register your team",
                  })
                }
                className="inline-flex h-11 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold uppercase tracking-wide text-black transition hover:bg-emerald-400 hover:shadow-[0_0_14px_rgba(16,185,129,0.6)]"
              >
                Register your team
              </Link>
            </div>

            {/* Social icons */}
            <div className="mt-6 flex items-center gap-3">
              <a
                href="https://www.facebook.com/profile.php?id=61588172021259"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="SIXFL Facebook"
                onClick={() =>
                  track("social_click", {
                    platform: "facebook",
                    location: "footer",
                  })
                }
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:border-emerald-400 hover:text-emerald-400"
              >
                <FaFacebookF />
              </a>

              <a
                href="https://instagram.com/sixfl_official"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="SIXFL Instagram"
                onClick={() =>
                  track("social_click", {
                    platform: "instagram",
                    location: "footer",
                  })
                }
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:border-emerald-400 hover:text-emerald-400"
              >
                <FaInstagram />
              </a>
            </div>
          </div>

          {/* Navigation */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
              Navigation
            </div>

            <nav className="mt-4 flex flex-col gap-3 text-sm text-white/80">
              <Link className="transition hover:text-emerald-400" href="/leagues">
                Leagues
              </Link>

              <Link className="transition hover:text-emerald-400" href="/venues">
                Venues
              </Link>

              <Link className="transition hover:text-emerald-400" href="/pricing">
                Pricing
              </Link>

              <Link className="transition hover:text-emerald-400" href="/faq">
                FAQ
              </Link>

              <Link
                className="font-semibold text-white transition hover:text-emerald-400"
                href="/register-team"
              >
                Register
              </Link>
            </nav>
          </div>

          {/* Legal */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
              Legal
            </div>

            <nav className="mt-4 flex flex-col gap-3 text-sm text-white/80">
              <Link className="transition hover:text-emerald-400" href="/league-rules">
                League Rules
              </Link>

              <Link className="transition hover:text-emerald-400" href="/league-agreement">
                League Agreement
              </Link>

              <Link className="transition hover:text-emerald-400" href="/referee-agreement">
                Referee Agreement
              </Link>

              <Link className="transition hover:text-emerald-400" href="/match-rules">
                Match Rules
              </Link>
            </nav>
          </div>

          {/* Safeguarding */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
              Safeguarding
            </div>

            <nav className="mt-4 flex flex-col gap-3 text-sm text-white/80">
              <Link
                className="transition hover:text-emerald-400"
                href="/safeguarding/safeguarding-policy"
              >
                Safeguarding Policy
              </Link>

              <Link
                className="transition hover:text-emerald-400"
                href="/safeguarding/code-of-conduct"
              >
                Code of Conduct
              </Link>

              <Link
                className="transition hover:text-emerald-400"
                href="/safeguarding/anti-bullying"
              >
                Anti-Bullying Policy
              </Link>

              <Link
                className="transition hover:text-emerald-400"
                href="/safeguarding/reporting-concerns"
              >
                Reporting Concerns
              </Link>
            </nav>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 h-[2px] w-full bg-emerald-500/40"></div>

        <div className="mt-5 flex flex-col gap-3 text-xs text-white/50 md:flex-row md:items-center md:justify-between">
          <div>© {new Date().getFullYear()} SIXFL. All rights reserved.</div>
          <div>6-a-side football. Done properly.</div>
        </div>
      </div>
    </footer>
  );
}