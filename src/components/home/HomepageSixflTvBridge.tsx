// ========================================
// File: src/components/home/HomepageSixflTvBridge.tsx
// ========================================

"use client";

import { usePathname } from "next/navigation";
import SixflTvHomepageSection from "@/components/home/SixflTvHomepageSection";

export default function HomepageSixflTvBridge() {
  const pathname = usePathname();

  if (pathname !== "/") return null;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8">
      <SixflTvHomepageSection />
    </div>
  );
}
