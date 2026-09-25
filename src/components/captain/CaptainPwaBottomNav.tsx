"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

function useChatUnreadCount(teamId: string, pathname: string) {
  const [result, setResult] = useState<{ teamId: string; count: number } | null>(null);
  useEffect(() => {
    let active = true;
    let sequence = 0;
    let controller: AbortController | null = null;
    setResult(null);
    const refresh = async () => {
      if (document.visibilityState === "hidden") return;
      const request = ++sequence;
      controller?.abort();
      controller = new AbortController();
      try {
        // This existing read-only endpoint supports both captain and player
        // memberships through getPortalChatUnreadCount. It never marks chats read.
        const response = await fetch(`/api/player/team/${encodeURIComponent(teamId)}/chat-unread`, {
          cache: "no-store", signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok || typeof payload?.unreadCount !== "number" ||
            !Number.isSafeInteger(payload.unreadCount) || payload.unreadCount < 0) {
          throw new Error("Chat unread count unavailable");
        }
        if (active && request === sequence) setResult({ teamId, count: payload.unreadCount });
      } catch {
        // Never fall back to a different inbox's total or keep a stale team badge.
        if (active && request === sequence) setResult(null);
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 10000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [teamId, pathname]);
  return result?.teamId === teamId ? result.count : 0;
}

export default function CaptainPwaBottomNav({ teamId, squadHref }: {
  teamId: string;
  squadHref: string;
  /** Legacy layout prop retained for compatibility, never used for the Chat badge. */
  unreadMessageCount?: number;
}) {
  const pathname = usePathname();
  const { tab } = getCaptainAppSection(pathname, teamId);
  const unreadChatCount = useChatUnreadCount(teamId, pathname);
  const base = `/captain/team/${teamId}`;
  const items: Array<{ href: string; label: CaptainAppTab; icon: typeof HomeIcon; unreadCount?: number }> = [
    { href: base, label: "Home", icon: HomeIcon },
    { href: `${base}/fixtures`, label: "Fixtures", icon: CalendarDaysIcon },
    { href: squadHref, label: "Squad", icon: UsersIcon },
    { href: `${base}/player-payments`, label: "Payments", icon: BanknotesIcon },
    { href: `${base}/chat`, label: "Chat", icon: ChatBubbleLeftRightIcon, unreadCount: unreadChatCount },
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
