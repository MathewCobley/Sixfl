// ========================================
// File: src/app/(public)/northallerton-6-a-side-football/page.tsx
// ========================================

import type { Metadata } from "next";

import { LocalSeoLandingPage, localSeoPages } from "../local-seo-pages";

const page = localSeoPages.northallerton;

export const metadata: Metadata = {
  title: "6-a-side Football in Northallerton | SIXFL",
  description: page.description,
  alternates: { canonical: page.canonicalPath },
};

export default function NorthallertonSixAsideFootballPage() {
  return <LocalSeoLandingPage page={page} />;
}
