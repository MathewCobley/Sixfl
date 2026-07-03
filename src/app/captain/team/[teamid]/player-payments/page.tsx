// ========================================
// File: src/app/captain/team/[teamid]/player-payments/page.tsx
// ========================================

import PaymentPageServer from "./PaymentPageServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Squad Payments | SIXFL",
};

export default PaymentPageServer;
