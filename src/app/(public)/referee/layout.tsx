import type { ReactNode } from "react";
import { requireReferee } from "@/lib/admin";

export default async function RefereeLayout({ children }: { children: ReactNode }) {
  await requireReferee();
  return <>{children}</>;
}
