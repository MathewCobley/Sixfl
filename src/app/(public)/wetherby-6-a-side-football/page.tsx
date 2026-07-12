// ========================================
// File: src/app/(public)/wetherby-6-a-side-football/page.tsx
// ========================================

import type { Metadata } from "next";

import { LocalSeoLandingPage, localSeoPages } from "../local-seo-pages";

const page = localSeoPages.wetherby;

export const metadata: Metadata = {
  title: "6-a-side Football in Wetherby | SIXFL",
  description: page.description,
  alternates: { canonical: page.canonicalPath },
};

export default function WetherbySixAsideFootballPage() {
  return <LocalSeoLandingPage page={page} />;
}
