// ========================================
// File: src/app/(admin)/admin/player-prospects/layout.tsx
// ========================================

import ProspectChaseBridge from "@/components/admin/player-prospects/ProspectChaseBridge";
import ProspectPlayerPoolBridge from "@/components/admin/player-prospects/ProspectPlayerPoolBridge";

export default function PlayerProspectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ProspectChaseBridge />
      <ProspectPlayerPoolBridge />
      {children}
    </>
  );
}
