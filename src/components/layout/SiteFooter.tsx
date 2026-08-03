// ========================================
// File: src/components/layout/SiteFooter.tsx
// ========================================

"use client";

import Image from "next/image";
import Link from "next/link";
import { FaFacebookF, FaInstagram } from "react-icons/fa";
import { track } from "@vercel/analytics";

const navigationLinks = [
  ["Leagues", "/leagues"],
  ["Venues", "/venues"],
  ["Pricing", "/pricing"],
  ["Free Founding Kit Offer", "/founding-teams"],
  ["FAQ", "/faq"],
  ["Register", "/register-team"],
] as const;

const legalLinks = [
  ["League Rules", "/league-rules"],
  ["League Agreement", "/league-agreement"],
  ["Kit Offer Terms", "/founding-team-kit-terms"],
  ["Referee Agreement", "/referee-agreement"],
  ["Match Rules", "/match-rules"],
] as const;

const safeguardingLinks = [
  ["Safeguarding Policy", "/safeguarding/safeguarding-policy"],
  ["Code of Conduct", "/safeguarding/code-of-conduct"],
  ["Anti-Bullying Policy", "/safeguarding/anti-bullying"],
  ["Reporting Concerns", "/safeguarding/reporting-concerns"],
] as const;

function FooterLinks({
  title,
  links,
}: {
  title: string;
  links: readonly (readonly [string, string])[];
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
        {title}
      </div>
      <nav className="mt-4 flex flex-col gap-1 text-sm text-white/80">
        {links.map(([label, href]) => (
          <Link
            key={href}
            className="inline-flex min-h-9 items-center transition hover:text-emerald-400"
            href={href}
          >
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export default function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-black text-white">
      <div className="h-[3px] w-full bg-emerald-500" />

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

          <FooterLinks title="Navigation" links={navigationLinks} />
          <FooterLinks title="Legal" links={legalLinks} />
          <FooterLinks title="Safeguarding" links={safeguardingLinks} />
        </div>

        <div className="mt-10 h-[2px] w-full bg-emerald-500/40" />

        <div className="mt-5 flex flex-col gap-3 text-xs text-white/50 md:flex-row md:items-center md:justify-between">
          <div>© {new Date().getFullYear()} SIXFL. All rights reserved.</div>
          <div>6-a-side football. Done properly.</div>
        </div>
      </div>
    </footer>
  );
}
