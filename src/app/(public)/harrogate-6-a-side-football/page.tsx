// ========================================
// File: src/app/(public)/harrogate-6-a-side-football/page.tsx
// ========================================

import type { Metadata } from "next";

import { LocalSeoLandingPage, localSeoPages } from "../local-seo-pages";

const page = localSeoPages.harrogate;

export const metadata: Metadata = {
  title: "6-a-side Football in Harrogate | SIXFL",
  description: page.description,
  alternates: { canonical: page.canonicalPath },
};

export default function HarrogateSixAsideFootballPage() {
  return <LocalSeoLandingPage page={page} />;
}
