import Link from "next/link";
import { notFound } from "next/navigation";
import { PortalMessageSenderRole } from "@prisma/client";

import { getAdminSixflSupportConversation } from "@/lib/admin/app-messaging";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { requireAdmin } from "@/lib/requireAdmin";
import { sendAdminSixflChatReplyAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function senderLabel(input: {
  senderRole: PortalMessageSenderRole;
  senderName: string | null;
  participantName: string;
}) {
  if (input.senderRole === PortalMessageSenderRole.ADMIN) return "SIXFL";
  if (input.senderRole === PortalMessageSenderRole.SYSTEM) return "SIXFL";
  return input.senderName || input.participantName;
}

export default async function AdminSixflSupportConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  await requireAdmin();
  const { conversationId } = await params;
  const conversation = await getAdminSixflSupportConversation(conversationId);
  if (!conversation) notFound();

  const action = sendAdminSixflChatReplyAction.bind(null, conversation.id);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <div className="space-y-5">
        <div>
          <Link
            href="/admin/chat#sixfl-inbox"
            className="text-sm font-semibold text-emerald-300 hover:text-emerald-200"
          >
            ← Messages to SIXFL
          </Link>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300/70">
                Message to SIXFL
              </div>
              <h1 className="mt-1 text-2xl font-black text-white">
                {conversation.participantName}
              </h1>
              <p className="mt-1 text-sm text-white/45">{conversation.team.name}</p>
            </div>
            <span
              className={
                conversation.needsReply
                  ? "rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-100"
                  : "rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-100"
              }
            >
              {conversation.needsReply ? "Needs reply" : "Replied"}
            </span>
          </div>
        </div>

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.025]">
          <div className="max-h-[58vh] space-y-3 overflow-y-auto p-4 sm:p-5">
            {conversation.messages.length === 0 ? (
              <div className="py-10 text-center text-sm text-white/40">
                No messages in this conversation yet.
              </div>
            ) : (
              conversation.messages.map((message) => {
                const fromSixfl =
                  message.senderRole === PortalMessageSenderRole.ADMIN ||
                  message.senderRole === PortalMessageSenderRole.SYSTEM;
                const senderName =
                  message.senderUser?.name?.trim() ||
                  message.senderUser?.email?.trim() ||
                  null;

                return (
                  <div
                    key={message.id}
                    className={`flex ${fromSixfl ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={
                        fromSixfl
                          ? "max-w-[85%] rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-emerald-50"
                          : "max-w-[85%] rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-white/85"
                      }
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white/40">
                        <span>
                          {senderLabel({
                            senderRole: message.senderRole,
                            senderName,
                            participantName: conversation.participantName,
                          })}
                        </span>
                        <span>·</span>
                        <span>
                          {formatDateTimeInLondon(message.createdAt, {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <div className="whitespace-pre-wrap break-words text-sm leading-6">
                        {message.body}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <form action={action} className="border-t border-white/10 bg-black/20 p-4 sm:p-5">
            <label className="block text-sm font-semibold text-white">Reply as SIXFL</label>
            <textarea
              name="message"
              required
              maxLength={2000}
              rows={3}
              placeholder={`Reply to ${conversation.participantName}…`}
              className="mt-2 w-full resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/30 focus:border-emerald-400/40"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs leading-5 text-white/40">
                Sends inside SIXFL Chat. If app notifications are enabled, they will also receive a phone alert.
              </p>
              <button
                type="submit"
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-emerald-400 px-4 text-sm font-black text-black hover:bg-emerald-300"
              >
                Send reply
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
