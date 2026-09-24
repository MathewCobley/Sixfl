import Link from "next/link";
import {
  BanknotesIcon,
  BookOpenIcon,
  CalendarDaysIcon,
  ChartBarSquareIcon,
  ChatBubbleLeftRightIcon,
  ChevronRightIcon,
  ClipboardDocumentCheckIcon,
  ClockIcon,
  DocumentCheckIcon,
  GiftIcon,
  LifebuoyIcon,
  PlayCircleIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  TrophyIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { requireCaptain } from "@/lib/requireCaptain";
import styles from "@/components/captain/CaptainAppScreens.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CaptainMorePage({ params }: { params: Promise<{ teamid: string }> }) {
  const { teamid } = await params;
  await requireCaptain(teamid);
  const base = `/captain/team/${teamid}`;
  const groups = [
    { label: "Matchday", rows: [
      { href: `${base}/availability`, label: "Availability", icon: CalendarDaysIcon },
      { href: `${base}/results`, label: "Match reports", icon: ClipboardDocumentCheckIcon },
      { href: `${base}/match-fees`, label: "Matchday squad", icon: UserGroupIcon },
      { href: `${base}/payments`, label: "Team payments", icon: BanknotesIcon },
      { href: `${base}/results-history`, label: "Team results", icon: TrophyIcon },
    ] },
    { label: "Team", rows: [
      { href: `${base}/player-pool`, label: "PlayerPool", icon: UserGroupIcon },
      { href: `${base}/player-stats`, label: "Player stats", icon: ChartBarSquareIcon },
      { href: `${base}/kit`, label: "Team kit", icon: ShoppingBagIcon },
      { href: `${base}/weeks-unavailable`, label: "Fixture planning", icon: ClockIcon },
      { href: `${base}/availability/history`, label: "Availability history", icon: CalendarDaysIcon },
      { href: `${base}/whatsapp`, label: "WhatsApp tools", icon: ChatBubbleLeftRightIcon },
    ] },
    { label: "SIXFL TV & competitions", rows: [
      { href: `${base}/tv`, label: "SIXFL TV", icon: PlayCircleIcon },
      { href: `${base}/veo-priority`, label: "Priority score", icon: TrophyIcon },
      { href: `${base}/cup-invitations`, label: "Cup invitations", icon: GiftIcon },
    ] },
    { label: "Help", rows: [
      { href: `${base}/agreement`, label: "Captain Agreement", icon: DocumentCheckIcon },
      { href: `${base}/rules`, label: "Match rules", icon: ShieldCheckIcon },
      { href: `${base}/guide`, label: "Captain guide", icon: BookOpenIcon },
      { href: `${base}/help`, label: "Help / Contact SIXFL", icon: LifebuoyIcon },
    ] },
  ];
  return (
    <div className={styles.menu}>
      <h1 className={styles.srOnly}>More</h1>
      {groups.map((group) => (
        <section key={group.label} className={styles.menuGroup} aria-label={group.label}>
          <h2>{group.label}</h2>
          <div className={styles.menuRows}>
            {group.rows.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className={styles.menuRow}>
                <Icon aria-hidden="true" /><span>{label}</span><ChevronRightIcon aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
