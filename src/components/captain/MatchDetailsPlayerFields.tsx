import styles from "./MatchDetailsPlayerFields.module.css";

export type MatchDetailsPlayer = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  played: boolean;
  goals: number;
  assists: number;
  rating: number | null;
};

/** One set of native inputs at every width. Resizing never creates duplicate
 * field names, discards edits or changes the existing server-action payload. */
export default function MatchDetailsPlayerFields({ players, goalsFor }: {
  players: MatchDetailsPlayer[];
  goalsFor: number | null;
}) {
  return (
    <div className={styles.container} data-match-player-fields>
      <p className="px-4 py-3 text-xs text-white/60">Ratings are optional: enter 1–10 with up to one decimal place, such as 9.2, or leave blank.</p>
      <div className={styles.heading} aria-hidden="true">
        <span>Player</span><span>Played</span><span>Goals</span><span>Assists</span><span>Rating</span>
      </div>
      {players.length === 0 ? (
        <p className={styles.empty}>No squad players are available for this team yet.</p>
      ) : players.map((player) => (
        <div key={player.id} className={styles.player} data-match-player={player.id}>
          <div className={styles.identity}>
            <span className={styles.name}>{player.name}</span>
            <span className={styles.description}>
              {player.role.replaceAll("_", " ").toLowerCase()}
              {player.email ? ` · ${player.email}` : ""}
            </span>
          </div>
          <label className={styles.played}>
            <input type="checkbox" name={`played_${player.id}`} defaultChecked={player.played}
              aria-label={`Mark ${player.name} as played`} />
            <span className={styles.mobileLabel}>Played</span>
          </label>
          <label className={styles.field}>
            <span className={styles.mobileLabel}>Goals</span>
            <input type="number" name={`scorerGoals_${player.id}`} defaultValue={player.goals}
              min={0} max={goalsFor ?? undefined} inputMode="numeric" aria-label={`Goals for ${player.name}`} />
          </label>
          <label className={styles.field}>
            <span className={styles.mobileLabel}>Assists</span>
            <input type="number" name={`assists_${player.id}`} defaultValue={player.assists}
              min={0} max={goalsFor ?? undefined} inputMode="numeric" aria-label={`Assists for ${player.name}`} />
          </label>
          <label className={styles.field}>
            <span className={styles.mobileLabel}>Rating</span>
            <input type="number" name={`rating_${player.id}`} defaultValue={player.rating ?? ""}
              min={1} max={10} step={0.1} inputMode="decimal" placeholder="—"
              aria-label={`Rating for ${player.name}`} />
          </label>
        </div>
      ))}
    </div>
  );
}
