// ========================================
// File: src/app/(admin)/admin/player-prospects/layout.tsx
// ========================================

import ProspectChaseBridge from "@/components/admin/player-prospects/ProspectChaseBridge";

export default function PlayerProspectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ProspectChaseBridge />
      {children}
    </>
  );
}
