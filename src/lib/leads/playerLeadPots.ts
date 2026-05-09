// ========================================
// File: src/lib/leads/playerLeadPots.ts
// ========================================

export type PlayerLeadPotKey =
  | "NEW_INTEREST"
  | "MOBILE_ONLY_NEEDS_EMAIL"
  | "EMAIL_REQUESTED"
  | "NEEDS_YES_CONFIRMATION"
  | "CONFIRMED_INTEREST"
  | "OPTIONAL_DETAILS_REQUESTED"
  | "READY_TO_PLACE"
  | "ADDED_TO_SQUAD"
  | "DORMANT"
  | "NOT_NOW";

export type PlayerLeadPotTone =
  | "emerald"
  | "blue"
  | "amber"
  | "violet"
  | "slate";

export type PlayerLeadPotDefinition = {
  key: PlayerLeadPotKey;
  title: string;
  shortTitle: string;
  description: string;
  actionLabel: string;
  chaseRule: string;
  tone: PlayerLeadPotTone;
};

export const PLAYER_LEAD_POTS: PlayerLeadPotDefinition[] = [
  {
    key: "NEW_INTEREST",
    title: "New player interest",
    shortTitle: "New interest",
    description:
      "Fresh player enquiries that need sorting into the right next step.",
    actionLabel: "Review and route",
    chaseRule: "First response due now",
    tone: "emerald",
  },
  {
    key: "MOBILE_ONLY_NEEDS_EMAIL",
    title: "Mobile-only — needs email",
    shortTitle: "Needs email",
    description:
      "Phone number captured, but no email yet. Ask for email before treating as ready.",
    actionLabel: "Request email",
    chaseRule: "Max 3 chases, then dormant",
    tone: "amber",
  },
  {
    key: "EMAIL_REQUESTED",
    title: "Email requested",
    shortTitle: "Email requested",
    description:
      "The first request has gone out and the lead is waiting to respond.",
    actionLabel: "Chase email",
    chaseRule: "24h, 3d, 7d",
    tone: "blue",
  },
  {
    key: "NEEDS_YES_CONFIRMATION",
    title: "Needs YES confirmation",
    shortTitle: "Needs YES",
    description:
      "Has an email or mobile, but has not confirmed they definitely want to play.",
    actionLabel: "Send YES button",
    chaseRule: "Confirm before placing",
    tone: "violet",
  },
  {
    key: "CONFIRMED_INTEREST",
    title: "Confirmed interest",
    shortTitle: "Confirmed",
    description:
      "They have positively confirmed they want to be considered for a squad.",
    actionLabel: "Request optional details",
    chaseRule: "Send placement details link",
    tone: "emerald",
  },
  {
    key: "OPTIONAL_DETAILS_REQUESTED",
    title: "Optional details requested",
    shortTitle: "Details requested",
    description:
      "Asked for position, level and availability. These help placement but should not block progress.",
    actionLabel: "Review details",
    chaseRule: "Soft nudge only",
    tone: "blue",
  },
  {
    key: "READY_TO_PLACE",
    title: "Ready to place",
    shortTitle: "Ready to place",
    description:
      "Enough information and confirmation to add them into a managed squad.",
    actionLabel: "Add to squad",
    chaseRule: "High priority",
    tone: "emerald",
  },
  {
    key: "ADDED_TO_SQUAD",
    title: "Added to squad",
    shortTitle: "Added",
    description:
      "Converted player lead. Keep for reporting and conversion tracking.",
    actionLabel: "Converted",
    chaseRule: "No chase",
    tone: "slate",
  },
  {
    key: "DORMANT",
    title: "Dormant",
    shortTitle: "Dormant",
    description:
      "The chase sequence has finished or the lead has gone quiet. Keep them for future campaigns.",
    actionLabel: "Leave in pot",
    chaseRule: "No active chase",
    tone: "slate",
  },
  {
    key: "NOT_NOW",
    title: "Not now",
    shortTitle: "Not now",
    description:
      "Interested later or not suitable for the current league build.",
    actionLabel: "Future campaign",
    chaseRule: "No active chase",
    tone: "slate",
  },
];

const PLAYER_LEAD_POT_KEYS = new Set(
  PLAYER_LEAD_POTS.map((pot) => pot.key),
);

export function isPlayerLeadPotKey(value?: string): value is PlayerLeadPotKey {
  return Boolean(value && PLAYER_LEAD_POT_KEYS.has(value as PlayerLeadPotKey));
}

export function getPlayerLeadPotDefinition(key: PlayerLeadPotKey) {
  return PLAYER_LEAD_POTS.find((pot) => pot.key === key) ?? PLAYER_LEAD_POTS[0];
}

export function playerLeadPotToneClasses(tone: PlayerLeadPotTone) {
  if (tone === "emerald") {
    return {
      card: "border-emerald-500/20 bg-emerald-500/[0.07]",
      badge: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
      dot: "bg-emerald-400",
    };
  }

  if (tone === "blue") {
    return {
      card: "border-blue-500/20 bg-blue-500/[0.07]",
      badge: "border-blue-500/30 bg-blue-500/15 text-blue-300",
      dot: "bg-blue-400",
    };
  }

  if (tone === "amber") {
    return {
      card: "border-amber-500/20 bg-amber-500/[0.07]",
      badge: "border-amber-500/30 bg-amber-500/15 text-amber-300",
      dot: "bg-amber-400",
    };
  }

  if (tone === "violet") {
    return {
      card: "border-violet-500/20 bg-violet-500/[0.07]",
      badge: "border-violet-500/30 bg-violet-500/15 text-violet-300",
      dot: "bg-violet-400",
    };
  }

  return {
    card: "border-white/10 bg-white/[0.04]",
    badge: "border-white/10 bg-white/5 text-white/60",
    dot: "bg-white/40",
  };
}
