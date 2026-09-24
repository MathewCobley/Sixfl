"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BanknotesIcon,
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  EllipsisHorizontalCircleIcon,
  HomeIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import { getCaptainAppSection, type CaptainAppTab } from "@/lib/captain/app-navigation";
import styles from "./CaptainAppScreens.module.css";

export default function CaptainPwaBottomNav({ teamId, squadHref, unreadMessageCount = 0 }: {
  teamId: string;
  squadHref: string;
  unreadMessageCount?: number;
}) {
  const { tab } = getCaptainAppSection(usePathname(), teamId);
  const base = `/captain/team/${teamId}`;
  const items: Array<{ href: string; label: CaptainAppTab; icon: typeof HomeIcon; unreadCount?: number }> = [
    { href: base, label: "Home", icon: HomeIcon },
    { href: `${base}/fixtures`, label: "Fixtures", icon: CalendarDaysIcon },
    { href: squadHref, label: "Squad", icon: UsersIcon },
    { href: `${base}/player-payments`, label: "Payments", icon: BanknotesIcon },
    { href: `${base}/messages`, label: "Inbox", icon: ChatBubbleLeftRightIcon, unreadCount: unreadMessageCount },
    { href: `${base}/more`, label: "More", icon: EllipsisHorizontalCircleIcon },
  ];

  // The layout already gates this to installed/preview app mode. Do not hide
  // navigation at a desktop breakpoint: landscape phones and tablets need it too.
  return (
    <nav aria-label="Captain quick navigation" className={styles.bottomNav}>
      <div className={styles.tabBar}>
        {items.map(({ href, label, icon: Icon, unreadCount }) => (
          <Link key={label} href={href} className={styles.tab}
            aria-current={tab === label ? "page" : undefined}
            aria-label={unreadCount && unreadCount > 0 ? `${label}, ${unreadCount} unread` : label}>
            <span className={styles.tabIcon}>
              <Icon aria-hidden="true" />
              {unreadCount && unreadCount > 0 ? (
                <span aria-hidden="true" className={styles.unread}>{unreadCount > 99 ? "99+" : unreadCount}</span>
              ) : null}
            </span>
            <span>{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
