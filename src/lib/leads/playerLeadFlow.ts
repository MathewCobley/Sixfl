// ========================================
// File: src/lib/leads/playerLeadFlow.ts
// ========================================

export type PlayerLeadFlowStatusKey =
  | "SMS_LEAD"
  | "ACTIVE_LEAD"
  | "PRE_ACTIVATION_SQUAD_PLAYER"
  | "ACTIVE_SQUAD_PLAYER"
  | "UNRESPONSIVE"
  | "UNRESPONSIVE_SQUAD_PLAYER"
  | "MOVED";

export type LeadPotStorageKey =
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

export type PlayerLeadFlowTone =
  | "emerald"
  | "blue"
  | "amber"
  | "violet"
  | "slate";

export type PlayerLeadFlowStatusDefinition = {
  key: PlayerLeadFlowStatusKey;
  title: string;
  shortTitle: string;
  description: string;
  actionLabel: string;
  chaseRule: string;
  tone: PlayerLeadFlowTone;
  storageStatuses: LeadPotStorageKey[];
  moveToStorageStatus: LeadPotStorageKey;
};

export const PLAYER_LEAD_FLOW_STATUSES: PlayerLeadFlowStatusDefinition[] = [
  {
    key: "SMS_LEAD",
    title: "SMS lead",
    shortTitle: "SMS lead",
    description:
      "Mobile-only player enquiries. The aim is to collect an email address and move them into the active lead flow.",
    actionLabel: "Request email",
    chaseRule: "Immediate, 72 hours, 1 week, final chase",
    tone: "amber",
    storageStatuses: ["MOBILE_ONLY_NEEDS_EMAIL"],
    moveToStorageStatus: "MOBILE_ONLY_NEEDS_EMAIL",
  },
  {
    key: "ACTIVE_LEAD",
    title: "Active lead",
    shortTitle: "Active lead",
    description:
      "A valid player lead with enough contact detail to ask whether they want to join a squad.",
    actionLabel: "Ask to join squad",
    chaseRule: "Email plus SMS chase if available",
    tone: "emerald",
    storageStatuses: [
      "NEW_INTEREST",
      "EMAIL_REQUESTED",
      "NEEDS_YES_CONFIRMATION",
    ],
    moveToStorageStatus: "NEEDS_YES_CONFIRMATION",
  },
  {
    key: "PRE_ACTIVATION_SQUAD_PLAYER",
    title: "Pre-activation squad player",
    shortTitle: "Pre-activation",
    description:
      "They have indicated they want to join a team, but still need activation or placement follow-up before being treated as active.",
    actionLabel: "Send activation",
    chaseRule: "24 hours, 72 hours, 1 week",
    tone: "violet",
    storageStatuses: [
      "CONFIRMED_INTEREST",
      "OPTIONAL_DETAILS_REQUESTED",
      "READY_TO_PLACE",
    ],
    moveToStorageStatus: "CONFIRMED_INTEREST",
  },
  {
    key: "ACTIVE_SQUAD_PLAYER",
    title: "Active squad player",
    shortTitle: "Active squad",
    description:
      "A player who has been activated or added to a squad and should now be monitored through availability responses.",
    actionLabel: "Monitor availability",
    chaseRule: "Check availability response over 4 weeks",
    tone: "emerald",
    storageStatuses: ["ADDED_TO_SQUAD"],
    moveToStorageStatus: "ADDED_TO_SQUAD",
  },
  {
    key: "UNRESPONSIVE",
    title: "Unresponsive",
    shortTitle: "Unresponsive",
    description:
      "A lead who did not respond to the current chase sequence. Stop active chasing and keep for future review.",
    actionLabel: "Stop chasing",
    chaseRule: "No active chase",
    tone: "slate",
    storageStatuses: ["DORMANT"],
    moveToStorageStatus: "DORMANT",
  },
  {
    key: "UNRESPONSIVE_SQUAD_PLAYER",
    title: "Unresponsive squad player",
    shortTitle: "Quiet squad",
    description:
      "A squad player who has stopped responding to availability requests and needs to be treated separately from new leads.",
    actionLabel: "Availability chase",
    chaseRule: "Reminder, 72 hours, 1 week, final removal notice",
    tone: "blue",
    storageStatuses: ["DORMANT"],
    moveToStorageStatus: "DORMANT",
  },
  {
    key: "MOVED",
    title: "Moved",
    shortTitle: "Moved",
    description:
      "A player who has been moved out of the active flow, for example because they are no longer relevant to the current league build.",
    actionLabel: "Leave moved",
    chaseRule: "No active chase",
    tone: "slate",
    storageStatuses: ["NOT_NOW"],
    moveToStorageStatus: "NOT_NOW",
  },
];

const PLAYER_LEAD_FLOW_STATUS_KEYS = new Set(
  PLAYER_LEAD_FLOW_STATUSES.map((status) => status.key),
);

export function isPlayerLeadFlowStatusKey(
  value?: string,
): value is PlayerLeadFlowStatusKey {
  return Boolean(
    value && PLAYER_LEAD_FLOW_STATUS_KEYS.has(value as PlayerLeadFlowStatusKey),
  );
}

export function getPlayerLeadFlowStatusDefinition(
  key: PlayerLeadFlowStatusKey,
) {
  return (
    PLAYER_LEAD_FLOW_STATUSES.find((status) => status.key === key) ??
    PLAYER_LEAD_FLOW_STATUSES[0]
  );
}

export function playerLeadFlowToneClasses(tone: PlayerLeadFlowTone) {
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
