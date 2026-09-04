import type { ReactNode } from "react";

import NightBoardNav from "@/components/admin/night-board/NightBoardNav";

export default function NightBoardLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="w-full px-4 pt-5 sm:px-6 lg:px-8">
        <NightBoardNav />
      </div>
      <div className="[&_table]:w-full [&_table]:table-fixed">{children}</div>
    </>
  );
}
