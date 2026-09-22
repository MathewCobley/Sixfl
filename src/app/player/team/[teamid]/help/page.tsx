import Link from "next/link";
import {
  ChatBubbleLeftRightIcon,
  ExclamationTriangleIcon,
  QuestionMarkCircleIcon,
} from "@heroicons/react/24/outline";

type PageProps = {
  params: Promise<{ teamid: string }>;
  searchParams?: Promise<{ previewMembershipId?: string }>;
};

function withPreview(href: string, previewMembershipId: string | null) {
  if (!previewMembershipId) return href;
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("previewMembershipId", previewMembershipId);
  return `${path}?${params.toString()}`;
}

export const metadata = { title: "Help / Contact SIXFL | Player App" };

export default async function PlayerHelpPage({ params, searchParams }: PageProps) {
  const { teamid } = await params;
  const sp = (await searchParams) ?? {};
  const previewMembershipId = sp.previewMembershipId?.trim() || null;

  const messageHref = withPreview(
    `/player/team/${teamid}/chat?conversation=sixfl`,
    previewMembershipId,
  );

  const rows = [
    {
      title: "Message SIXFL",
      description: "Send a private message to the SIXFL team inside the app.",
      href: messageHref,
      icon: ChatBubbleLeftRightIcon,
    },
    {
      title: "Fixture or matchday problem",
      description:
        "For something affecting an upcoming game, include the fixture and what has happened.",
      href: messageHref,
      icon: ExclamationTriangleIcon,
    },
    {
      title: "General help",
      description:
        "Questions about your account, payments, stats or using the player app.",
      href: messageHref,
      icon: QuestionMarkCircleIcon,
    },
  ];

  return (
    <main className="px-4 pb-28 pt-5 text-white">
      <div className="mx-auto w-full max-w-xl">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300/70">
            Player app
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">
            Help / Contact SIXFL
          </h1>
          <p className="mt-2 text-sm leading-6 text-white/45">
            Get help without leaving the player app.
          </p>
        </div>

        <section className="mt-5 overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.04]">
          {rows.map((row, index) => {
            const Icon = row.icon;
            return (
              <Link
                key={row.title}
                href={row.href}
                className={[
                  "flex min-h-[5rem] items-center gap-4 px-4 py-3 active:bg-white/[0.05]",
                  index < rows.length - 1 ? "border-b border-white/[0.06]" : "",
                ].join(" ")}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-200">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-black text-white">
                    {row.title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-white/40">
                    {row.description}
                  </span>
                </span>
              </Link>
            );
          })}
        </section>

        <p className="mt-4 text-xs leading-5 text-white/35">
          For the quickest help, include your team name and the fixture if your question is match-related.
        </p>
      </div>
    </main>
  );
}
