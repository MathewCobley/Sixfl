import type { ReactNode } from "react";
import LatestNews from "@/components/news/LatestNews";

export default function NewsDiscoveryTemplate({ children }: { children: ReactNode }) {
  // News is supplementary: keep the team header and match controls above it.
  return <>{children}<LatestNews scope="player" /></>;
}
