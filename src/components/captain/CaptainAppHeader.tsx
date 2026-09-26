"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getCaptainAppSection } from "@/lib/captain/app-navigation";
import styles from "./CaptainAppScreens.module.css";

function initials(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "").join("") || "S";
}

export default function CaptainAppHeader({ teamId, teamName, teamLogoUrl }: {
  teamId: string;
  teamName: string;
  teamLogoUrl: string | null;
}) {
  const { title } = getCaptainAppSection(usePathname(), teamId);
  const contextLabel = title === "Home" ? "Captain Portal" : `Captain Portal · ${title}`;
  return (
    <header className={`captain-app-header ${styles.appHeader}`}>
      <div className={styles.headerInner}>
        <Link href={`/captain/team/${teamId}`} aria-label="SIXFL captain home" className={styles.logoLink}>
          <img src="/logo2.png" alt="SIXFL" width={88} height={26} />
        </Link>
        <div className={styles.headerTitle}>
          <strong>{teamName}</strong>
          <span>{contextLabel}</span>
        </div>
        <Link href={`/captain/team/${teamId}/more`} aria-label={`More options for ${teamName}`} className={styles.badgeLink}>
          {teamLogoUrl ? <img src={teamLogoUrl} alt="" width={34} height={34} /> : <span>{initials(teamName)}</span>}
        </Link>
      </div>
    </header>
  );
}
