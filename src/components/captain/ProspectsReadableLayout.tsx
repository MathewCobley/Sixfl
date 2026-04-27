// ========================================
// File: src/components/captain/ProspectsReadableLayout.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function ProspectsReadableLayout() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.endsWith("/prospects")) return;

    const styleId = "sixfl-prospects-readable-layout";
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      main section[class*="lg:grid-cols-[0.85fr_1.15fr]"] {
        grid-template-columns: minmax(0, 1fr) !important;
      }

      main div[class*="lg:grid-cols-[1fr_1fr_auto]"] {
        grid-template-columns: minmax(0, 1fr) !important;
      }

      main div[class*="lg:grid-cols-[1fr_1fr_auto]"] > form {
        min-width: 0 !important;
        width: 100% !important;
      }

      main div[class*="lg:grid-cols-[1fr_1fr_auto]"] textarea,
      main div[class*="lg:grid-cols-[1fr_1fr_auto]"] input {
        min-width: 0 !important;
        width: 100% !important;
      }

      main div[class*="lg:grid-cols-[1fr_1fr_auto]"] form:first-child > div[class*="sm:grid-cols-2"] {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      }

      @media (max-width: 760px) {
        main div[class*="lg:grid-cols-[1fr_1fr_auto]"] form:first-child > div[class*="sm:grid-cols-2"] {
          grid-template-columns: minmax(0, 1fr) !important;
        }
      }
    `;

    document.head.appendChild(style);

    return () => {
      document.getElementById(styleId)?.remove();
    };
  }, [pathname]);

  return null;
}
