# SIXFL TV private footage uploads

This release implements the upload library, NOT the complete video studio.

## Admin workflow

Open Admin > SIXFL TV > Upload footage, find the fixture (league/team search), and open Upload / manage footage. Select multiple individual highlight clips or one full-match file, then explicitly start the upload. A ready-made highlights MP4 is optional. Shared intro/outro files are uploaded once and appear on every fixture workspace. Saved clips can be reordered with the up/down controls.

The workspace prominently states that automatic assembly, thumbnail editing and direct YouTube publishing are not yet connected. Do not advertise those as live. Source uploads never set Fixture.sixflTvUrl, mark a fixture as recorded, change its result, queue player emails or call YouTube. Existing link-saving and notification paths are unchanged.

## Storage and boundaries

- Uses the existing private Railway bucket via src/lib/storage/railway-s3.ts and the existing AWS_* references. No credentials or bucket keys are exposed to the browser.
- Durable source bytes are stored under sixfl-tv-footage/v1/{asset UUID}/ as immutable 8 MiB parts. Postgres stores only IDs, ordered manifests, hashes, byte counts, uploader audit and lifecycle state. The source can be streamed back as the exact original MP4, including byte ranges.
- This first uploader proxies one bounded part through the authenticated web API. It is NOT yet a direct browser-to-bucket uploader: server-to-bucket and preview/download traffic counts as service egress. A later presigned multipart upgrade can reduce that cost once bucket CORS and access controls are verified. Do not claim the transfers are free.
- Limits: 50 individual clips per fixture (1 GiB each), one assembled highlights file (2 GiB), one full match (8 GiB), five shared intros/outros per type (250 MiB each). The new footage library reserves at most 100 GiB, including incomplete files. This is an application safeguard, not pre-purchased space or a report of the whole Railway account. Ordinary storage/transfer billing still applies to bytes actually stored/transferred.
- Files must have an MP4 extension and ISO-BMFF ftyp header. This is not a full media decoder or codec compatibility test. Source previews may require downloading for codecs the browser does not support; processing-time FFprobe validation belongs in the future worker.

## Resume, races and deletion

The client sends one file/part at a time. Browser refresh/connection loss retains acknowledged parts. Reselect the same source on its incomplete row; every skipped part is verified with SHA-256 against the saved manifest. Full-file metadata reuse does not overwrite a READY file. A changed uploaded part is rejected.

An asset lease serialises storage writes and blocks removal while a part is in flight. The key/hash manifest is reserved before storage I/O; a crash or timeout therefore leaves enough information for retry or cleanup. After a storage failure a lease may take up to two minutes to expire. Only complete, stored, contiguous manifests become READY. Completed input files are immutable.

No retention-based deletion runs automatically. Removal requires explicit confirmation, affects only that asset's keys, and runs in bounded batches; interrupted DELETING entries can continue removal. Shared intro/outro removal explains its shared scope. Keep an independent backup of important footage. Any future renderer must add use/lease guards before allowing deletion of assets used by active jobs.

## Verification

The dedicated workflow uses an isolated localhost PostgreSQL schema and fake object storage before and after the complete production prebuild, plus full TypeScript/Next production build and actual component browser tests on Chromium/WebKit, phone/desktop. Production credentials and customer messages are never used in CI. Existing critical feature/DOM gates remain mandatory.

Before calling an actual production upload verified: sign in as admin, upload a small approved sample, resume an interrupted sample, preview/download and compare the returned hash, then explicitly remove the sample. Deployment/startup alone is not this end-to-end test. Large real-match throughput and cloud cost still need measurement.
