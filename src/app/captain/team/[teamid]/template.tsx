import type { ReactNode } from "react";
import LatestNews from "@/components/news/LatestNews";
import CaptainTeamScrollToTop from "@/components/captain/CaptainTeamScrollToTop";

export default function NewsDiscoveryTemplate({ children }: { children: ReactNode }) {
  return (
    <>
      <CaptainTeamScrollToTop />
      <LatestNews scope="captain" />
      {children}
    </>
  );
}
