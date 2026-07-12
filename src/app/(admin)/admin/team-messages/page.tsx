import { redirect } from "next/navigation";

export default function LegacyTeamMessagesPage() {
  redirect("/admin/messaging");
}
