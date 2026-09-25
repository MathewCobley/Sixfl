import type { ReactNode } from "react";
import LatestNews from "@/components/news/LatestNews";
import CaptainPwaModeOnly from "@/components/captain/CaptainPwaModeOnly";
import CaptainTeamScrollToTop from "@/components/captain/CaptainTeamScrollToTop";

export default function NewsDiscoveryTemplate({ children }: { children: ReactNode }) {
  return (
    <>
      <CaptainTeamScrollToTop />
      <CaptainPwaModeOnly mode="web">
        <LatestNews scope="captain" />
      </CaptainPwaModeOnly>
      {children}
    </>
  );
}
