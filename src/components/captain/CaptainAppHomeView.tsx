import Link from "next/link";
import {
  CalendarDaysIcon,
  ChevronRightIcon,
  ExclamationCircleIcon,
  PlayCircleIcon,
  TrophyIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import styles from "./CaptainAppScreens.module.css";

export type CaptainAppHomeData = {
  teamId: string;
  nextFixture: null | {
    label: string;
    dateLabel: string;
    venueLabel: string;
    statusLabel: string;
    statusTone: "emerald" | "amber" | "red" | "neutral";
    countdownLabel: string;
  };
  leaguePosition: string;
  reportsDue: number;
  openIssues: number;
  paymentDueNowLabel: string;
  overdueConfirmations: number;
};

export default function CaptainAppHomeView({
  teamId,
  teamName,
  nextFixture,
  leaguePosition,
  reportsDue,
  openIssues,
  paymentDueNowLabel,
  overdueConfirmations,
}: CaptainAppHomeData & { teamName: string }) {
  const base = `/captain/team/${teamId}`;
  const paymentOutstanding = paymentDueNowLabel !== "£0.00";
  const links = [
    { href: `${base}/availability`, label: "Player availability", Icon: CalendarDaysIcon },
    { href: `${base}/player-pool`, label: "PlayerPool", Icon: UserGroupIcon },
    { href: `${base}/results-history`, label: "Team results", Icon: TrophyIcon },
    { href: `${base}/tv`, label: "SIXFL TV", Icon: PlayCircleIcon },
  ];

  return (
    <div className={styles.home} data-captain-app-home>
      <header className={styles.identity}>
        <h1>{teamName}</h1>
        {leaguePosition !== "—" ? <p>{leaguePosition} in the league</p> : null}
      </header>

      {nextFixture ? (
        <Link href={`${base}/fixtures`} className={styles.matchCard}
          aria-label={`Match details: ${nextFixture.label}, ${nextFixture.dateLabel}`}>
          <div className={styles.matchHeading}>
            <h2>Next match</h2>
            <span>{nextFixture.countdownLabel}</span>
          </div>
          {/* This is native match text, not a heading for the legacy badge
              injector to replace with oversized desktop badges/predictors. */}
          <p className={styles.matchup} data-captain-native-match>{nextFixture.label}</p>
          <p className={styles.matchDate}>{nextFixture.dateLabel}</p>
          <p className={styles.venue}>{nextFixture.venueLabel}</p>
          <div className={styles.matchFooter}>
            <span className={styles.status} data-tone={nextFixture.statusTone}>
              {nextFixture.statusLabel}
            </span>
            <span className={styles.matchAction}>Match details <ChevronRightIcon aria-hidden="true" /></span>
          </div>
        </Link>
      ) : (
        <section className={styles.empty} aria-label="Next match">
          <CalendarDaysIcon aria-hidden="true" />
          <div><h2>No match scheduled</h2><p>Your next published fixture will appear here.</p></div>
        </section>
      )}

      <div className={styles.summary} aria-label="Team payments and reports">
        <Link href={`${base}/payments`} className={styles.metric}
          aria-label={`Team balance: ${paymentDueNowLabel}`}>
          <strong data-attention={paymentOutstanding || undefined}>{paymentDueNowLabel}</strong>
          <span>Team balance <ChevronRightIcon aria-hidden="true" /></span>
        </Link>
        <Link href={`${base}/results`} className={styles.metric}
          aria-label={`${reportsDue} match reports to finish`}>
          <strong data-attention={reportsDue > 0 || undefined}>{reportsDue}</strong>
          <span>Reports to finish <ChevronRightIcon aria-hidden="true" /></span>
        </Link>
      </div>

      {overdueConfirmations > 0 || openIssues > 0 ? (
        <section className={styles.attention} aria-label="Needs attention">
          {overdueConfirmations > 0 ? (
            <Link href={`${base}/fixtures`} className={styles.alertRow}>
              <ExclamationCircleIcon aria-hidden="true" />
              <span>{overdueConfirmations === 1 ? "Confirm your fixture" : `Confirm ${overdueConfirmations} fixtures`}</span>
              <ChevronRightIcon aria-hidden="true" />
            </Link>
          ) : null}
          {openIssues > 0 ? (
            <Link href={`${base}/results`} className={styles.alertRow}>
              <ExclamationCircleIcon aria-hidden="true" />
              <span>{openIssues} result {openIssues === 1 ? "issue" : "issues"} to review</span>
              <ChevronRightIcon aria-hidden="true" />
            </Link>
          ) : null}
        </section>
      ) : null}

      <nav className={styles.toolList} aria-label="Team tools">
        {links.map(({ href, label, Icon }) => (
          <Link key={href} href={href} className={styles.toolRow}>
            <Icon aria-hidden="true" />
            <span>{label}</span>
            <ChevronRightIcon aria-hidden="true" />
          </Link>
        ))}
      </nav>
    </div>
  );
}
