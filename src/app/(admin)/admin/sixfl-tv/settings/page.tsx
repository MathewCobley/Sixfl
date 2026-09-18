import Link from "next/link";
import { redirect } from "next/navigation";

import FootageUploader from "@/components/admin/sixfl-tv/FootageUploader";
import { footageState } from "@/lib/sixfl-tv/footage";
import { requireAdmin } from "@/lib/requireAdmin";
import { checkYoutubeConnection, getYoutubeConnectionStatus } from "@/lib/sixfl-tv/youtube";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function checkYoutubeConnectionAction() {
  "use server";
  await requireAdmin();
  let checked: Awaited<ReturnType<typeof checkYoutubeConnection>>;
  try {
    checked = await checkYoutubeConnection();
  } catch {
    redirect("/admin/sixfl-tv/settings?youtubeError=The%20saved%20YouTube%20connection%20could%20not%20be%20verified.%20Reconnect%20the%20channel%20and%20try%20again.");
  }
  const channel = encodeURIComponent(checked.channelTitle || checked.channelId);
  redirect(`/admin/sixfl-tv/settings?youtubeCheck=ok&youtubeChannel=${channel}`);
}

export default async function SixflTvSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ youtube?: string; youtubeError?: string; youtubeCheck?: string; youtubeChannel?: string }>;
}) {
  await requireAdmin();
  const sp = (await searchParams) ?? {};
  const [youtube, sharedFootage] = await Promise.all([
    getYoutubeConnectionStatus(),
    footageState(null),
  ]);

  return <div className="space-y-6">
    <header>
      <p className="text-sm font-semibold text-emerald-300">SIXFL TV</p>
      <h1 className="mt-2 text-3xl font-bold text-white">Settings</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
        Global SIXFL TV setup. These settings apply across every fixture.
      </p>
    </header>

    {sp.youtube === "connected" ? <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">SIXFL YouTube connected successfully.</p> : null}
    {sp.youtubeCheck === "ok" ? <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">YouTube connection verified{sp.youtubeChannel ? ` for ${sp.youtubeChannel}` : ""}. No video was uploaded.</p> : null}
    {sp.youtubeError ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">{sp.youtubeError}</p> : null}

    <section className="rounded-3xl border border-red-400/20 bg-red-500/[0.05] p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-200/70">YouTube</p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            {youtube.connected ? "SIXFL YouTube connected" : youtube.configured ? "Connect SIXFL YouTube" : "YouTube setup incomplete"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/60">
            {youtube.connected
              ? <>Connected{youtube.channelTitle ? <> to <strong className="text-white/85">{youtube.channelTitle}</strong></> : ""}. This one connection is shared by every SIXFL TV match. {youtube.replacementCleanupEnabled ? "Replacement cleanup is enabled: when a newer version is published, older SIXFL copies can be removed from YouTube." : "Reconnect YouTube once to allow SIXFL to remove older copies after a replacement is safely published."}</>
              : youtube.configured
                ? "Authorise the SIXFL YouTube channel once. The connection is also used to remove superseded SIXFL TV copies after a safe replacement."
                : "The Google OAuth credentials are not fully configured on the SIXFL server yet."}
          </p>
        </div>
        {youtube.configured ? <div className="flex flex-wrap gap-2">
          {youtube.connected ? <form action={checkYoutubeConnectionAction}>
            <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/80">Check connection</button>
          </form> : null}
          <Link href="/api/admin/sixfl-tv/youtube/start" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-100">
            {youtube.connected && !youtube.replacementCleanupEnabled ? "Reconnect to enable replacement cleanup" : youtube.connected ? "Reconnect YouTube" : "Connect YouTube"}
          </Link>
        </div> : null}
      </div>
    </section>

    <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.05] p-5 sm:p-6">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200/70">Shared branding</p>
        <h2 className="mt-2 text-xl font-semibold text-white">Intro and outro</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
          Upload these once. They are available to every match render.
        </p>
      </div>
      <FootageUploader initial={sharedFootage} sharedOnly />
    </section>
  </div>;
}
