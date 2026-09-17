# SIXFL TV studio pipeline

This document describes the implementation on `feat/sixfl-tv-render-pipeline`. It is not live until the branch has passed current-head checks, been merged, the additive migration has deployed, and the separate render worker has been verified.

## Intended admin workflow

1. Admin > SIXFL TV > Upload footage > selected fixture continues to use the existing private source library.
2. `Generate / refresh previews` snapshots the current confirmed result, saved scorer records, team names/badges, shared intro/outro and the fixture's current source selection. Highlights use a ready-made highlights source when present; otherwise they use the saved ordered clips. The full-match render uses the separate full-match source.
3. A separate Railway worker (`Dockerfile.sixfl-tv-worker`) reconstructs sources from immutable 8 MiB private parts, makes a SIXFL TV title card and full-time card, normalises segments with FFmpeg, retains source match audio, and writes the finished private MP4 back as bounded 8 MiB parts. The web process never runs FFmpeg.
4. Admin reviews the private highlights/full-match preview and can download it.
5. Admin separately edits/saves Highlights and Full Match 1280x720 thumbnails. The template uses actual fixture teams/badges, league/date and optionally the confirmed score. Generated thumbnails remain private.
6. After Google OAuth is configured and the SIXFL channel has been authorised, each finished render has an explicit `Approve & upload privately to YouTube` action. It always starts as YouTube `private`, sends the exact saved matching thumbnail, and does not send customer/player notifications.

## Match-data rules

- No branded render is queued without a saved final result.
- Disputed results block generation until resolved.
- Scorers come only from saved MatchResultTeamMeta scorer records with positive goal counts. No scorer is invented and a final score is never used to infer goal order.
- Official-overturn results suppress scorer text rather than presenting stale playing-event data as the official outcome.
- Source asset IDs and fixture metadata are snapshotted into a render fingerprint. An identical completed job is reused; an active changed job is not silently replaced.
- Source deletion is blocked while a queued/processing render references that asset.

## Persistence and retry boundaries

Migration `20260917213000_sixfl_tv_studio` adds only new studio tables. It does not rewrite source footage or existing fixture links.

- `SixflTvRenderJob` / `SixflTvRenderInput` / `SixflTvRenderPart`: private render manifest, immutable input snapshot and output parts.
- `SixflTvThumbnail`: one current private thumbnail per fixture/video kind.
- `SixflTvYoutubeConnection`: encrypted refresh-token record and authorised channel identity.
- `SixflTvYoutubePublish`: explicitly approved transfer, resumable Google upload URL/offset and returned video ID/URL.

The renderer uses a lease/heartbeat and recovers stale processing jobs. YouTube video transfers use the official resumable upload flow and persist the session URL/acknowledged byte offset. A failed explicitly approved transfer can be resumed against the same finished render rather than silently creating a second job.

There is no automatic source-footage retention deletion. No render or upload queues player emails.

## Railway worker

Create a separate production service from the same repository/main branch using `Dockerfile.sixfl-tv-worker`. It should be a single replica initially. It needs the same production `DATABASE_URL` and private bucket variables as the website, plus `NEXT_PUBLIC_SITE_URL`/`NEXTAUTH_URL`. The worker should not expose a public domain.

Start with a small approved sample render before any long full-match job. Do not increase service/spend limits as part of this release without explicit approval.

## Google / YouTube setup

The application expects these website and worker variables:

- `YOUTUBE_CLIENT_ID`
- `YOUTUBE_CLIENT_SECRET`
- `SIXFL_TV_TOKEN_KEY` (a high-entropy server-side secret used only to encrypt the stored refresh token)

The Google Cloud project must enable YouTube Data API v3 and use an OAuth **Web application** client. Its authorised redirect URI is exactly:

`https://sixfl.co.uk/api/admin/sixfl-tv/youtube/callback`

The app requests offline OAuth access so a refresh token can be stored encrypted. The connected channel ID/title are read after consent and displayed before any upload approval.

The code uses Google/YouTube's `videos.insert` resumable upload flow with `notifySubscribers=false`, then `thumbnails.set`. The first upload privacy is always `private`. Google restricts uploads from some unaudited API projects to private viewing; do not claim public/unlisted publishing until the project's YouTube API compliance status supports it and the product gains a separate explicit release control.

## Release gate

Before merge/deploy:

- isolated upload-library tests pass with the studio migration present;
- studio queue/thumbnail/OAuth queue contracts pass against isolated PostgreSQL and fake storage;
- production prebuild followed by both test suites passes;
- full TypeScript and Next production build passes;
- the worker Docker image builds with FFmpeg;
- DOM/critical feature checks pass;
- exact diff is reviewed for unrelated changes.

After merge/deploy, completion still requires: worker service healthy; one small real uploaded source successfully produces a private preview; thumbnail save/preview works; Google OAuth connects to the intended SIXFL channel; and an explicitly approved private YouTube transfer is verified. A green website deployment by itself is not completion.
