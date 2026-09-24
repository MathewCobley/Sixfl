/** Presentation only. Never use a selected tab to make an access decision. */
export type CaptainAppTab = "Home" | "Fixtures" | "Squad" | "Payments" | "Inbox" | "More";

export function getCaptainAppSection(pathname: string, teamId: string): {
  title: string;
  tab: CaptainAppTab | null;
} {
  const path = pathname.split(/[?#]/, 1)[0].replace(/\/+$/, "");
  const base = `/captain/team/${teamId}`;
  if (path === base) return { title: "Home", tab: "Home" };
  if (!path.startsWith(`${base}/`)) return { title: "Captain", tab: null };

  const route = path.slice(base.length + 1);
  const within = (prefix: string) => route === prefix || route.startsWith(`${prefix}/`);
  if (within("fixtures")) return { title: "Fixtures", tab: "Fixtures" };
  if (within("captain-squad") || within("squad")) return { title: "Squad", tab: "Squad" };
  if (within("player-payments/account")) return { title: "Player account", tab: "Payments" };
  if (within("player-payments/accounts")) return { title: "Player balances", tab: "Payments" };
  if (within("player-payments")) return { title: "Squad payments", tab: "Payments" };
  if (within("payments")) return { title: "Team payments", tab: "Payments" };
  if (within("messages") || within("chat")) return { title: "Inbox", tab: "Inbox" };

  const titles: Record<string, string> = {
    availability: "Availability",
    "results-history": "Team results",
    results: "Match reports",
    "match-fees": "Matchday squad",
    "player-pool": "PlayerPool",
    "player-stats": "Player stats",
    "veo-priority": "Priority score",
    tv: "SIXFL TV",
    kit: "Team kit",
    "weeks-unavailable": "Fixture planning",
    whatsapp: "WhatsApp",
    "cup-invitations": "Cup invitations",
    rules: "Match rules",
    guide: "Captain guide",
    help: "Help",
    prospects: "Prospects",
    more: "More",
  };
  return { title: titles[route.split("/")[0]] ?? "More", tab: "More" };
}
