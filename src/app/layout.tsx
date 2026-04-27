// ========================================
// File: src/app/layout.tsx
// ========================================

import "./globals.css";
import type { ReactNode } from "react";
import Providers from "./providers";

export const metadata = {
  title: "SIXFL",
  description: "Six-a-side football league platform",
  icons: {
    icon: "/icon.png",
  },
};

const safeClosestPatch = String.raw`
(function () {
  if (typeof window === "undefined" || typeof Element === "undefined") return;
  if (window.__sixflSafeClosestPatchApplied) return;

  window.__sixflSafeClosestPatchApplied = true;

  var originalClosest = Element.prototype.closest;

  if (typeof originalClosest !== "function") return;

  function escapeClassSelector(selector) {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return selector.replace(/\.([^\s>+~:#.,()[\]]+\[[^\s>+~:#.,()]+\][^\s>+~:#.,()]*)/g, function (_, className) {
        return "." + CSS.escape(className);
      });
    }

    return selector.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
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

      return originalClosest.call(this, escapeClassSelector(selector));
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
