// ========================================
// File: src/app/(public)/harrogate-6-a-side-football/page.tsx
// ========================================

import type { Metadata } from "next";

import { LocalSeoLandingPage, localSeoPages } from "../local-seo-pages";

const page = localSeoPages.harrogate;

export const metadata: Metadata = {
  title: "Harrogate 6-a-side Football League | Rossett Sports Centre | SIXFL",
  description:
    "Play organised 6-a-side football in Harrogate with SIXFL at Rossett Sports Centre. Tuesday league fixtures, results, tables and team or player registration.",
  alternates: { canonical: page.canonicalPath },
  openGraph: {
    title: "Harrogate 6-a-side Football League | SIXFL",
    description:
      "Organised Tuesday 6-a-side football at Rossett Sports Centre in Harrogate, with weekly fixtures, results, tables and registration.",
    url: page.canonicalPath,
    type: "website",
  },
};

export default function HarrogateSixAsideFootballPage() {
  return <LocalSeoLandingPage page={page} />;
}
