// ========================================
// File: src/components/admin/AdminCard.tsx
// ========================================

import type { ReactNode } from "react";

type AdminCardProps = {
  title?: string;
  children: ReactNode;
  className?: string;
};

export default function AdminCard({
  title,
  children,
  className,
}: AdminCardProps) {
  return (
    <section
      className={[
        "rounded-3xl border border-white/10 bg-white/[0.03]",
        className ?? "",
      ].join(" ")}
    >
      {title ? (
        <div className="border-b border-white/10 px-6 py-5">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
        </div>
      ) : null}

      <div className="px-6 py-6">{children}</div>
    </section>
  );
}