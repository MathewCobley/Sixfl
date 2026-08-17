// ========================================
// File: src/components/layout/SiteFooter.tsx
// ========================================

"use client";

import Image from "next/image";
import Link from "next/link";
import { FaFacebookF, FaInstagram } from "react-icons/fa";
import { track } from "@vercel/analytics";

type FooterLink = {
  label: string;
  href: string;
  featured?: boolean;
};

const footerGroups: Array<{ title: string; links: FooterLink[] }> = [
  {
    title: "Get involved",
    links: [
      { label: "Register your team", href: "/register-team", featured: true },
      { label: "Join as a player", href: "/register-interest?type=player" },
      { label: "Refer a team · Earn £75", href: "/player/referrals", featured: true },
      { label: "Bring SIXFL to your area", href: "/bring-sixfl-to-your-area" },
      { label: "Founding Kit Package", href: "/founding-teams" },
    ],
  },
  {
    title: "Find football",
    links: [
      { label: "All leagues", href: "/leagues" },
      { label: "Harrogate 6-a-side", href: "/harrogate-6-a-side-football", featured: true },
      { label: "Northallerton 6-a-side", href: "/northallerton-6-a-side-football" },
      { label: "Thirsk 6-a-side", href: "/north-yorkshire-heartlands-6-a-side-football" },
      { label: "Catterick 6-a-side", href: "/north-yorkshire-heartlands-6-a-side-football" },
      { label: "Wetherby 6-a-side", href: "/wetherby-6-a-side-football" },
      { label: "Venues", href: "/venues" },
    ],
  },
  {
    title: "Help & information",
    links: [
      { label: "Pricing", href: "/pricing" },
      { label: "FAQ", href: "/faq" },
    ],
  },
  {
    title: "Rules & terms",
    links: [
      { label: "League Rules", href: "/league-rules" },
      { label: "Match Rules", href: "/match-rules" },
      { label: "League Agreement", href: "/league-agreement" },
      { label: "Privacy Policy", href: "/privacy-policy" },
      { label: "Kit Package Terms", href: "/founding-team-kit-terms" },
      { label: "Referee Agreement", href: "/referee-agreement" },
    ],
  },
  {
    title: "Safeguarding",
    links: [
      { label: "Safeguarding Policy", href: "/safeguarding/safeguarding-policy" },
      { label: "Code of Conduct", href: "/safeguarding/code-of-conduct" },
      { label: "Anti-Bullying Policy", href: "/safeguarding/anti-bullying" },
      { label: "Reporting Concerns", href: "/safeguarding/reporting-concerns" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-black text-white">
      <div className="h-[3px] w-full bg-emerald-500"></div>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[1.35fr_repeat(5,minmax(0,1fr))] xl:gap-8">
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

          {footerGroups.map((group) => (
            <div key={group.title}>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
                {group.title}
              </div>

              <nav className="mt-4 flex flex-col gap-1 text-sm text-white/80" aria-label={`${group.title} footer links`}>
                {group.links.map((link) => (
                  <Link
                    key={`${link.href}-${link.label}`}
                    href={link.href}
                    className={[
                      "inline-flex min-h-9 items-center leading-5 transition hover:text-emerald-400",
                      link.featured ? "font-semibold text-emerald-200" : "",
                    ].join(" ")}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
          ))}
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
