import Link from "next/link";
import {
  CalendarDaysIcon,
  ChartBarSquareIcon,
  ChevronRightIcon,
  ExclamationCircleIcon,
  PlayCircleIcon,
  TrophyIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import styles from "./CaptainAppScreens.module.css";

type FixtureTeam = {
  name: string;
  logoUrl: string | null;
};

export type CaptainAppHomeData = {
  teamId: string;
  nextFixture: null | {
    label: string;
    dateLabel: string;
    venueLabel: string;
    statusLabel: string;
    statusTone: "emerald" | "amber" | "red" | "neutral";
    countdownLabel: string;
    homeTeam: FixtureTeam;
    awayTeam: FixtureTeam;
  };
  leaguePosition: string;
  reportsDue: number;
  openIssues: number;
  paymentDueNowLabel: string;
  overdueConfirmations: number;
};

function initials(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "T";
}

function TeamMark({ team }: { team: FixtureTeam }) {
  return (
    <div className={styles.matchTeam}>
      <div className={styles.matchTeamBadge}>
        {team.logoUrl ? (
          <img src={team.logoUrl} alt="" />
        ) : (
          <span>{initials(team.name)}</span>
        )}
      </div>
      <div className={styles.matchTeamName}>{team.name}</div>
    </div>
  );
}

export default function CaptainAppHomeView({
  teamId,
  teamName,
  teamLogoUrl,
  nextFixture,
  leaguePosition,
  reportsDue,
  openIssues,
  paymentDueNowLabel,
  overdueConfirmations,
}: CaptainAppHomeData & { teamName: string; teamLogoUrl: string | null }) {
  const base = `/captain/team/${teamId}`;
  const paymentOutstanding = paymentDueNowLabel !== "£0.00";
  const actions = [
    {
      href: `${base}/availability`,
      label: "Availability",
      description: "See who can play",
      tone: "emerald",
      Icon: CalendarDaysIcon,
    },
    {
      href: `${base}/player-pool`,
      label: "PlayerPool",
      description: "Find extra players",
      tone: "sky",
      Icon: UserGroupIcon,
    },
    {
      href: `${base}/results-history`,
      label: "Team results",
      description: "Results & form",
      tone: "amber",
      Icon: TrophyIcon,
    },
    {
      href: `${base}/tv`,
      label: "SIXFL TV",
      description: "Clips & highlights",
      tone: "violet",
      Icon: PlayCircleIcon,
    },
  ];

  return (
    <div className={styles.home} data-captain-app-home>
      <section className={styles.identity}>
        <div className={styles.identityTop}>
          <div className={styles.identityBadge} aria-hidden="true">
            {teamLogoUrl ? (
              <img src={teamLogoUrl} alt="" />
            ) : (
              <span>{initials(teamName)}</span>
            )}
          </div>
          <div className={styles.identityText}>
            <h1>{teamName}</h1>
            <div className={styles.identityPills}>
              <span className={styles.rolePill}>Captain</span>
              {leaguePosition !== "—" ? (
                <span className={styles.positionPill}>{leaguePosition} in the league</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className={styles.summary} aria-label="Team overview">
          <Link href={`${base}/table`} className={styles.metric}
            aria-label={leaguePosition === "—" ? "League position unavailable" : `League position: ${leaguePosition}`}>
            <strong>{leaguePosition}</strong>
            <span>League position</span>
          </Link>
          <Link href={`${base}/payments`} className={styles.metric}
            aria-label={`Team balance: ${paymentDueNowLabel}`}>
            <strong data-attention={paymentOutstanding || undefined}>{paymentDueNowLabel}</strong>
            <span>Team balance</span>
          </Link>
          <Link href={`${base}/results`} className={styles.metric}
            aria-label={`${reportsDue} match reports to finish`}>
            <strong data-attention={reportsDue > 0 || undefined}>{reportsDue}</strong>
            <span>Reports to finish</span>
          </Link>
          <Link href={`${base}/results`} className={styles.metric}
            aria-label={`Open issues: ${openIssues}`}>
            <strong data-attention={openIssues > 0 || undefined}>{openIssues}</strong>
            <span>Issues</span>
          </Link>
        </div>
      </section>

      {nextFixture ? (
        <Link href={`${base}/fixtures`} className={styles.matchCard}
          aria-label={`Match details: ${nextFixture.label}, ${nextFixture.dateLabel}`}>
          <div className={styles.matchHeading}>
            <div className={styles.matchHeadingLabel}>
              <CalendarDaysIcon aria-hidden="true" />
              <h2>Next match</h2>
            </div>
            <span>{nextFixture.countdownLabel}</span>
          </div>

          <p className={styles.srOnly} data-captain-native-match>{nextFixture.label}</p>

          <div className={styles.matchTeams}>
            <TeamMark team={nextFixture.homeTeam} />
            <div className={styles.versus}>VS</div>
            <TeamMark team={nextFixture.awayTeam} />
          </div>

          <div className={styles.matchMeta}>
            <p className={styles.matchDate}>{nextFixture.dateLabel}</p>
            <p className={styles.venue}>{nextFixture.venueLabel}</p>
          </div>

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

      <Link href={`${base}/table`} className={styles.tableShortcut}>
        <span className={styles.tableShortcutIcon}>
          <ChartBarSquareIcon aria-hidden="true" />
        </span>
        <span className={styles.tableShortcutText}>
          <strong>League table</strong>
          <small>
            {leaguePosition !== "—" ? `You're ${leaguePosition} · view full standings` : "View full standings"}
          </small>
        </span>
        <ChevronRightIcon aria-hidden="true" className={styles.tableShortcutArrow} />
      </Link>

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

      <nav className={styles.actionGrid} aria-label="Team tools">
        {actions.map(({ href, label, description, tone, Icon }) => (
          <Link key={href} href={href} className={styles.actionCard} data-tone={tone}>
            <Icon aria-hidden="true" />
            <div>
              <span className={styles.actionTitle}>{label}</span>
              <span className={styles.actionDescription}>{description}</span>
            </div>
          </Link>
        ))}
      </nav>
    </div>
  );
}
