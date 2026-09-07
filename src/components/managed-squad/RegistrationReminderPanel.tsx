import { getRegistrationReminderOverview, type RegistrationOverviewRow } from "@/lib/managed-squad/registration-reminders";
import { registrationEnabled } from "@/lib/managed-squad/registration-reminder-policy";
import { prisma } from "@/lib/prisma";

function time(value: Date | null) {
  return value ? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(value) : "";
}
export function RegistrationReminderTable({ rows, enabled }: { rows: RegistrationOverviewRow[]; enabled: boolean }) {
  return <section className="mb-6 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-5 text-white" aria-label="Automatic registration reminders">
    <h2 className="text-lg font-semibold">Automatic registration reminders {enabled ? "— on" : "— off"}</h2>
    <p className="mt-2 text-sm text-white/70">All managed squads: SMS after 24 hours, email after 3 days, final SMS after 7 days. Later messages also wait for the previous reminder to be sent. A permitted alternative channel is used when needed. Messages stop when a player joins, declines, replies or opts out.</p>
    <p className="mt-2 text-xs text-white/60">UK sending hours: 09:00–21:00. Existing overdue invitations receive one reminder at a time, not a batch of missed chases. Manual contact postpones automation. This is squad activation, not the optional profile-completeness badge.</p>
    <details className="mt-4">
      <summary className="cursor-pointer font-medium">View reminder status for {rows.length} pending {rows.length === 1 ? "player" : "players"}</summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-white/15"><th className="p-2">Player</th><th className="p-2">Next action / hold</th><th className="p-2">Reminder history</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id} className="border-b border-white/10 align-top">
            <td className="p-2 font-medium">{row.name}<div className="mt-1 text-xs font-normal text-white/60">{row.inviteSentAt ? `Invite sent: ${time(row.inviteSentAt)}` : "No confirmed sent invite"}</div></td>
            <td className="p-2">{row.plan.note}{row.plan.dueAt ? <div className="mt-1 text-xs text-white/60">{row.plan.state === "queued" ? "Queue schedule" : "Next eligible check"}: {time(row.plan.dueAt)}</div> : null}</td>
            <td className="p-2 text-xs text-white/70">{row.history.length ? row.history.map((d) => <div key={d.id} className="mb-2">{d.channel} — {d.status === "SENT" && d.sentAt ? `Sent: ${time(d.sentAt)}` : d.status === "QUEUED" ? `Queued for ${time(d.scheduledFor)} (not sent)` : d.status}{d.failureReason ? ` · ${d.failureReason}` : ""}</div>) : "No reminders sent"}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>
  </section>;
}
/** Parent layouts authorize the team before calling this read-only component. */
export default async function RegistrationReminderPanel({ teamId }: { teamId: string }) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { teamMode: true } });
  if (team?.teamMode !== "MANAGED") return null;
  return <RegistrationReminderTable rows={await getRegistrationReminderOverview(teamId)} enabled={registrationEnabled()} />;
}
