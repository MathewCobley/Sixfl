// ========================================
// File: src/app/layout.tsx
// ========================================

import "./globals.css";
import "./mobile.css";
import "./team-badge-sizing.css";
import "./hide-old-fixture-generator.css";
import { Suspense, type ReactNode } from "react";
import BridgeErrorBoundary from "@/components/BridgeErrorBoundary";
import PwaServiceWorker from "@/components/PwaServiceWorker";
import RouteScopedBridges from "@/components/RouteScopedBridges";
import Providers from "./providers";

export const metadata = {
  title: "SIXFL",
  description: "Six-a-side football league platform",
  applicationName: "SIXFL",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "SIXFL",
    statusBarStyle: "black-translucent" as const,
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
};

export const viewport = {
  themeColor: "#0b0f14",
  viewportFit: "cover" as const,
};

const safeClosestPatch = String.raw`
(function () {
  if (typeof window === "undefined" || typeof Element === "undefined") return;
  if (window.__sixflSafeClosestPatchApplied) return;

  window.__sixflSafeClosestPatchApplied = true;

  var originalClosest = Element.prototype.closest;

  if (typeof originalClosest !== "function") return;

  function isSimpleClassSelector(selector) {
    return (
      typeof selector === "string" &&
      selector.charAt(0) === "." &&
      !/[\s>+~:#,]/.test(selector)
    );
  }

  function findClosestByClassName(element, selector) {
    var className = selector.slice(1);
    var current = element;

    while (current && current.nodeType === 1) {
      if (current.classList && current.classList.contains(className)) {
        return current;
      }

      current = current.parentElement;
    }

    return null;
  }

  function escapeSelector(selector) {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function" && isSimpleClassSelector(selector)) {
      return "." + CSS.escape(selector.slice(1));
    }

    return selector
      .replace(/\[/g, "\\[")
      .replace(/\]/g, "\\]")
      .replace(/\./g, "\\.");
  }

  Element.prototype.closest = function patchedClosest(selector) {
    try {
      return originalClosest.call(this, selector);
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "SyntaxError") {
        throw error;
      }

      if (typeof selector !== "string" || selector.indexOf("[") === -1) {
        throw error;
      }

      if (isSimpleClassSelector(selector)) {
        return findClosestByClassName(this, selector);
      }

      try {
        return originalClosest.call(this, escapeSelector(selector));
      } catch (_) {
        return null;
      }
    }
  };
})();
`;

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0b0f14] text-white">
        <script dangerouslySetInnerHTML={{ __html: safeClosestPatch }} />
        <PwaServiceWorker />
        <Providers>
          <BridgeErrorBoundary>
            <Suspense fallback={null}>
              <RouteScopedBridges />
            </Suspense>
          </BridgeErrorBoundary>
          {children}
        </Providers>
      </body>
    </html>
  );
}
