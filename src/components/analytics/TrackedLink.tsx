// ========================================
// File: src/components/analytics/TrackedLink.tsx
// ========================================

"use client";

import Link from "next/link";
import { trackEvent, type AnalyticsEventName } from "@/lib/analytics";
import type { ReactNode } from "react";

type TrackedLinkProps = {
  href: string;
  children: ReactNode;
  className?: string;
  eventName: AnalyticsEventName;
  eventProps?: Record<string, string | number | boolean>;
  target?: string;
  rel?: string;
};

export default function TrackedLink({
  href,
  children,
  className,
  eventName,
  eventProps,
  target,
  rel,
}: TrackedLinkProps) {
  return (
    <Link
      href={href}
      className={className}
      target={target}
      rel={rel}
      onClick={() => trackEvent(eventName, eventProps)}
    >
      {children}
    </Link>
  );
}