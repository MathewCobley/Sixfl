"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useFormStatus } from "react-dom";
import styles from "./CaptainAppSquad.module.css";

export type CaptainAppSquadMember = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  squadNumber: number | null;
  role: string;
  roleLabel: string;
  isRegular: boolean;
  whatsAppUrl: string | null;
  addedLabel: string;
  goals: number;
  assists: number;
  playerOfMatchAwards: number;
  profile: { label: string; value: string }[];
  availabilityNotes: string | null;
};

type SquadAction = (formData: FormData) => Promise<void>;
type Props = {
  teamId: string;
  members: CaptainAppSquadMember[];
  canAddPlayers: boolean;
  savedMessage: string | null;
  errorMessage: string | null;
  addPlayerAction: SquadAction;
  sendLoginAction: SquadAction;
  setRegularAction: SquadAction;
};
type Filter = "all" | "regulars" | "organisers";
const isOrganiser = (member: CaptainAppSquadMember) =>
  ["CAPTAIN", "MANAGER", "VICE_CAPTAIN"].includes(member.role);
const normalise = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase("en-GB");

export function filterSquadMembers(members: CaptainAppSquadMember[], query: string, filter: Filter) {
  const search = normalise(query);
  return members.filter((member) => {
    if (filter === "regulars" && !member.isRegular) return false;
    if (filter === "organisers" && !isOrganiser(member)) return false;
    return !search || normalise([member.name, member.email, member.squadNumber == null ? "" : `#${member.squadNumber}`].join(" ")).includes(search);
  });
}

function SubmitButton({ children, busy = "Saving…", disabled = false }: {
  children: React.ReactNode; busy?: string; disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={disabled || pending} aria-busy={pending}>{pending ? busy : children}</button>;
}

/** Explicit server data and the existing authorised server actions. This screen
 * neither queries/scrapes the website nor changes player or membership rules. */
export default function CaptainAppSquad({ teamId, members, canAddPlayers, savedMessage, errorMessage,
  addPlayerAction, sendLoginAction, setRegularAction }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const id = useId();
  const base = `/captain/team/${encodeURIComponent(teamId)}`;
  const visible = filterSquadMembers(members, query, filter);
  const filters: { value: Filter; label: string; count: number }[] = [
    { value: "all", label: "All", count: members.length },
    { value: "regulars", label: "Regulars", count: members.filter((m) => m.isRegular).length },
    { value: "organisers", label: "Organisers", count: members.filter(isOrganiser).length },
  ];

  return (
    <section className={styles.screen} aria-label="Squad" data-captain-native-squad>
      <div className={styles.toolbar}>
        <p className={styles.count}><strong>{members.length}</strong> squad member{members.length === 1 ? "" : "s"}</p>
        {canAddPlayers ? (
          <button type="button" className={styles.addButton} aria-expanded={adding} aria-controls={`${id}-add`}
            onClick={() => setAdding(!adding)}>{adding ? "Close form" : "+ Add player"}</button>
        ) : <Link href={`${base}/help`} className={styles.addButton}>Contact SIXFL</Link>}
      </div>

      {savedMessage ? <p role="status" className={styles.success}>{savedMessage}</p> : null}
      {errorMessage ? <p role="alert" className={styles.error}>{errorMessage}</p> : null}
      {!canAddPlayers ? <p className={styles.managedNote}>SIXFL manages additions. You can edit your existing players below.</p> : null}

      {canAddPlayers ? (
        <section id={`${id}-add`} hidden={!adding} className={styles.addPanel} aria-label="Add a player">
          <h2>Add a player</h2>
          <p>Enter the player’s own email and mobile number. They will need to verify their email before match selection.</p>
          <form action={addPlayerAction} className={styles.addForm}>
            <input type="hidden" name="teamid" value={teamId} />
            <label>Player name<input name="displayName" required autoComplete="name" placeholder="Full name" /></label>
            <label>Player email<input name="email" type="email" required autoComplete="email" placeholder="player@example.com" /></label>
            <div className={styles.formPair}>
              <label>Mobile / SMS number<input name="phone" type="tel" required autoComplete="tel" /></label>
              <label>Shirt no. <span>(optional)</span><input name="squadNumber" type="number" min="1" max="99" inputMode="numeric" /></label>
            </div>
            <label className={styles.checkbox}><input name="usesWhatsapp" type="checkbox" />Player uses WhatsApp</label>
            <SubmitButton busy="Adding player…">Add player</SubmitButton>
          </form>
        </section>
      ) : null}

      <div className={styles.searchRow}>
        <label className={styles.search}>
          <span className={styles.srOnly}>Search squad</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or shirt number" autoComplete="off" />
        </label>
        <Link className={styles.availability} href={`${base}/availability`} title="Team availability" aria-label="Team availability">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 2v6m10-6v6M3 11h18m-14 4h3m4 0h3" /></svg>
        </Link>
      </div>
      <div className={styles.filters} role="group" aria-label="Filter squad">
        {filters.map((item) => <button key={item.value} type="button" aria-pressed={filter === item.value}
          onClick={() => setFilter(item.value)}>{item.label}<span>{item.count}</span></button>)}
      </div>
      <p className={styles.srOnly} role="status">{visible.length} of {members.length} squad members shown</p>

      {visible.length ? (
        <ul className={styles.roster} aria-label="Squad members">
          {visible.map((member) => {
            const expanded = expandedId === member.id;
            const detailsId = `${id}-member-${member.id}`;
            const initials = member.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
            return (
              <li className={styles.member} key={member.id}>
                <button type="button" className={styles.memberButton} aria-expanded={expanded} aria-controls={detailsId}
                  aria-label={`${member.name}, ${member.roleLabel}${member.isRegular ? ", regular" : ""}. ${expanded ? "Hide" : "Show"} player details`}
                  onClick={() => setExpandedId(expanded ? null : member.id)}>
                  <span className={styles.avatar} aria-hidden="true">{member.squadNumber != null ? <><small>#</small>{member.squadNumber}</> : initials || "?"}</span>
                  <span className={styles.identity}>
                    <strong>{member.name}</strong>
                    <span>{member.roleLabel}{member.isRegular ? " · Regular" : ""}{!member.email ? <em> · Email needed</em> : ""}</span>
                  </span>
                  <svg className={styles.chevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
                </button>
                <div id={detailsId} hidden={!expanded} className={styles.details}>
                  <dl className={styles.contactDetails}>
                    <div><dt>Email</dt><dd>{member.email || "No email saved"}</dd></div>
                    <div><dt>Phone</dt><dd>{member.phone || "No phone saved"}</dd></div>
                    {member.profile.map((detail) => <div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}
                  </dl>
                  {member.availabilityNotes ? <p className={styles.notes}>{member.availabilityNotes}</p> : null}
                  <dl className={styles.stats}>
                    <div><dt>Goals</dt><dd>{member.goals}</dd></div>
                    <div><dt>Assists</dt><dd>{member.assists}</dd></div>
                    <div><dt>Match awards</dt><dd>{member.playerOfMatchAwards}</dd></div>
                  </dl>
                  <section className={styles.actions} aria-label={`Actions for ${member.name}`}>
                    <Link href={`${base}/captain-squad/${encodeURIComponent(member.id)}/edit`}>Edit player</Link>
                    {member.whatsAppUrl ? <a href={member.whatsAppUrl} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${member.name}`}>WhatsApp ↗</a> : null}
                    <form action={setRegularAction}>
                      <input type="hidden" name="teamid" value={teamId} />
                      <input type="hidden" name="membershipId" value={member.id} />
                      <input type="hidden" name="isRegular" value={member.isRegular ? "false" : "true"} />
                      <input type="hidden" name="returnTo" value="captain-squad" />
                      <SubmitButton>{member.isRegular ? "Remove from regulars" : "Mark as regular"}</SubmitButton>
                    </form>
                    <form action={sendLoginAction}>
                      <input type="hidden" name="teamid" value={teamId} />
                      <input type="hidden" name="membershipId" value={member.id} />
                      <SubmitButton busy="Sending…" disabled={!member.email}>Send sign-in email</SubmitButton>
                    </form>
                  </section>
                  <p className={styles.added}>Added {member.addedLabel}</p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className={styles.empty}>
          <h2>{members.length ? "No matching players" : "Your squad is empty"}</h2>
          <p>{members.length ? "Try another name, shirt number or filter." : canAddPlayers ? "Add your first player to get started." : "Contact SIXFL to arrange your squad."}</p>
          {members.length ? <button type="button" onClick={() => { setQuery(""); setFilter("all"); }}>Show everyone</button> : null}
        </div>
      )}
      <section className={styles.actions} aria-label="Squad tools">
        <Link href={`${base}/player-pool`}>PlayerPool &amp; approvals</Link>
        <Link href={`${base}/help`}>Help with your squad</Link>
      </section>
    </section>
  );
}
