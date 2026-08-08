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
      <div className="h-[3px] w-full bg-emerald-500"></div>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:gap-10">
          <div className="max-w-md sm:col-span-2 lg:col-span-1">
            <Link href="/" className="inline-flex items-center">
              <Image
                src="/logo2.png"
                alt="SIXFL"
                width={200}
                height={60}
                sizes="(max-width: 640px) 150px, 200px"
                className="h-auto w-auto max-w-[150px] sm:max-w-[200px]"
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
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold uppercase tracking-wide text-black transition hover:bg-emerald-400 hover:shadow-[0_0_14px_rgba(16,185,129,0.6)] sm:w-auto"
              >
                Register your team
              </Link>
            </div>

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
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:border-emerald-400 hover:text-emerald-400"
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
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:border-emerald-400 hover:text-emerald-400"
              >
                <FaInstagram />
              </a>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
              Navigation
            </div>

            <nav className="mt-4 flex flex-col gap-1 text-sm text-white/80">
              <Link className="inline-flex min-h-9 items-center transition hover:text-emerald-400" href="/leagues">
                Leagues
              </Link>

              <Link className="inline-flex min-h-9 items-center font-semibold text-emerald-200 transition hover:text-emerald-400" href="/harrogate-6-a-side-football">
                Harrogate 6-a-side football
              </Link>

              <Link className="inline-flex min-h-9 items-center transition hover:text-emerald-400" href="/northallerton-6-a-side-football">
                Northallerton 6-a-side football
              </Link>

              <Link className="inline-flex min-h-9 items-center transition hover:text-emerald-400" href="/wetherby-6-a-side-football">
                Wetherby 6-a-side football
              </Link>

              <Link className="inline-flex min-h-9 items-center transition hover:text-emerald-400" href="/north-yorkshire-heartlands-6-a-side-football">
                Heartlands 6-a-side football
              </Link>

              <Link className="inline-flex min-h-9 items-center transition hover:text-emerald-400" href="/venues">
                Venues
              </Link>

              <Link className="inline-flex min-h-9 items-center transition hover:text-emerald-400" href="/pricing">
                Pricing
              </Link>

              <Link
                className="inline-flex min-h-9 items-center font-semibold text-emerald-200 transition hover:text-emerald-400"
                href="/bring-sixfl-to-your-area"
              >
                Bring SIXFL to your area
              </Link>

              <Link className="inline-flex min-h-9 items-center transition hover:text-emerald-400" href="/founding-teams">
                Founding Kit Package
              </Link>

              <Link className="inline-flex min-h-9 items-center transition hover:text-emerald-400" href="/faq">
                FAQ
              </Link>

              <Link
                className="inline-flex min-h-9 items-center font-semibold text-white transition hover:text-emerald-400"
                href="/register-team"
              >
                Register
              </Link>
            </nav>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
              Legal
            </div>

            <nav className="mt-4 flex flex-col gap-1 text-sm text-white/80">
              <Link className="inline-flex min-h-9 items-center transition hover:text-emerald-400" href="/league-rules">
                League Rules
              </Link>

              <Link className="inline-flex min-h-9 items-center transition hover:text-emerald-400" href="/league-agreement">
                League Agreement
              </Link>

              <Link className="inline-flex min-h-9 items-center transition hover:text-emerald-400" href="/founding-team-kit-terms">
                Kit Package Terms
              </Link>

              <Link className="inline-flex min-h-9 items-center transition hover:text-emerald-400" href="/referee-agreement">
                Referee Agreement
              </Link>

              <Link className="inline-flex min-h-9 items-center transition hover:text-emerald-400" href="/match-rules">
                Match Rules
              </Link>
            </nav>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
              Safeguarding
            </div>

            <nav className="mt-4 flex flex-col gap-1 text-sm text-white/80">
              <Link
                className="inline-flex min-h-9 items-center transition hover:text-emerald-400"
                href="/safeguarding/safeguarding-policy"
              >
                Safeguarding Policy
              </Link>

              <Link
                className="inline-flex min-h-9 items-center transition hover:text-emerald-400"
                href="/safeguarding/code-of-conduct"
              >
                Code of Conduct
              </Link>

              <Link
                className="inline-flex min-h-9 items-center transition hover:text-emerald-400"
                href="/safeguarding/anti-bullying"
              >
                Anti-Bullying Policy
              </Link>

              <Link
                className="inline-flex min-h-9 items-center transition hover:text-emerald-400"
                href="/safeguarding/reporting-concerns"
              >
                Reporting Concerns
              </Link>
            </nav>
          </div>
        </div>

        <div className="mt-10 h-[2px] w-full bg-emerald-500/40"></div>

        <div className="mt-5 flex flex-col gap-3 text-xs text-white/50 md:flex-row md:items-center md:justify-between">
          <div>© {new Date().getFullYear()} SIXFL. All rights reserved.</div>
          <div>6-a-side football. Done properly.</div>
        </div>
      </div>
    </footer>
  );
}
