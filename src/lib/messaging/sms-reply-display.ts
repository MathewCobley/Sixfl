export function smsReplyStatusLabel(status: string | null | undefined, providerStatus?: string | null) {
  const provider = (providerStatus || "").toLowerCase();
  if (provider === "delivered") return "Delivered";
  if (provider === "undelivered" || provider.startsWith("failed")) return "Failed";
  switch (status?.toUpperCase()) {
    case "QUEUED": return "Queued — not sent yet";
    case "PROCESSING": return "Sending — awaiting provider confirmation";
    case "SENT": return "Sent to SMS provider";
    case "FAILED": return "Failed";
    case "SKIPPED": return "Not sent — blocked by messaging settings";
    case "CANCELLED": return "Cancelled — not sent";
    default: return "Status needs checking";
  }
}
