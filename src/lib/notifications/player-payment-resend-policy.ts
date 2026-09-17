export const PLAYER_PAYMENT_RESEND_TEMPLATES: Record<string, string> = {
  PLAYER_MATCH_FEE_REQUEST: "player-match-fee-request-email",
  PLAYER_MATCH_FEE_CHASE_24H: "player-match-fee-chase-24h-email",
  PLAYER_MATCH_FEE_CHASE_72H: "player-match-fee-chase-72h-email",
};

export function canResendPlayerPaymentEmail(item: {
  channel: string;
  direction: string;
  statusLabel: string;
  templateKey: string | null;
}) {
  return item.channel === "EMAIL" && item.direction === "OUTBOUND" &&
    ["SENT", "DELIVERED", "OPENED", "CLICKED"].includes(item.statusLabel.trim().toUpperCase()) &&
    Boolean(item.templateKey && Object.values(PLAYER_PAYMENT_RESEND_TEMPLATES).includes(item.templateKey));
}
