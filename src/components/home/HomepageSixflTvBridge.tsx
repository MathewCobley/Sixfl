// ========================================
// File: src/components/home/HomepageSixflTvBridge.tsx
// ========================================

"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

import SixflTvHomepageSection from "@/components/home/SixflTvHomepageSection";

export default function HomepageSixflTvBridge() {
  const pathname = usePathname();
  const [mountNode, setMountNode] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (pathname !== "/") {
      setMountNode(null);
      return;
    }

    const main = document.querySelector("main");
    if (!main) return;

    const aiSection = Array.from(main.querySelectorAll("section")).find((section) =>
      section.textContent?.includes(
        "Match predictions, powered by SIXFL AI Predictor.",
      ),
    );

    if (!aiSection) return;

    const node = document.createElement("div");
    node.dataset.homepageSixflTv = "true";
    aiSection.parentElement?.insertBefore(node, aiSection);
    setMountNode(node);

    return () => {
      setMountNode(null);
      node.remove();
    };
  }, [pathname]);

  if (pathname !== "/" || !mountNode) return null;

  return createPortal(<SixflTvHomepageSection />, mountNode);
}
