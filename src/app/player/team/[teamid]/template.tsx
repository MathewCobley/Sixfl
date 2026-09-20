import type { ReactNode } from "react";
import LatestNews from "@/components/news/LatestNews";
import PlayerPwaModeOnly from "@/components/player/PlayerPwaModeOnly";

export default function NewsDiscoveryTemplate({ children }: { children: ReactNode }) {
  // News is supplementary: keep the team header and match controls above it.
  return <>{children}<PlayerPwaModeOnly mode="web"><LatestNews scope="player" /></PlayerPwaModeOnly></>;
}
