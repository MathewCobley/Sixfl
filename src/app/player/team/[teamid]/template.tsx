import type { ReactNode } from "react";
import LatestNews from "@/components/news/LatestNews";

export default function NewsDiscoveryTemplate({ children }: { children: ReactNode }) {
  return <><LatestNews scope="player" />{children}</>;
}
