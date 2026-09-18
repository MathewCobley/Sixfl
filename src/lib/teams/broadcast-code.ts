export function defaultTeamBroadcastCode(name: string) {
  const compact = String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9&]/g, "");
  return (compact.slice(0, 3) || "SIX").padEnd(3, "X");
}

export function normaliseTeamBroadcastCode(value: unknown, teamName: string) {
  const compact = String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return compact ? compact.slice(0, 3) : defaultTeamBroadcastCode(teamName);
}

export function isValidTeamBroadcastCode(value: string) {
  return /^[A-Z0-9&]{3}$/.test(value);
}
