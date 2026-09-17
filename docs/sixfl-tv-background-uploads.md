# SIXFL TV background upload queue

The authenticated admin layout owns `FootageUploadProvider`, which creates a single `FootageUploadQueue` for that admin session/tab. The match page subscribes to it; unmounting a fixture page does not own or cancel its transfer. Use internal Next.js admin navigation (including the sidebar) to continue working while uploading. A compact expandable bottom-corner panel shows fixture/name, progress, pending/completed state, pause/resume and links back to each fixture. Files from other fixtures may be queued and are transferred serially with their original fixture ID.

## Boundaries

This is browser-background uploading, not server-side access to files still on a computer. Keep the tab/browser open and the device awake/online. A document reload, closing the tab, leaving the admin layout, signing out, or browser/OS suspension can interrupt transfer. A beforeunload warning is installed only while the tab retains pending selections. The provider stops transfers on unmount and is keyed by admin identity. No background worker/service worker is claimed to survive browser closure.

The queue retains File references in memory only; it does not copy multi-gigabyte files into browser storage or persist private filenames to localStorage. Completed file references are released. In-tab paused/failed files can resume without re-selection. After a reload, use the existing incomplete-source picker to reselect the same file; every skipped saved part is SHA-256 checked. A failed transfer pauses other waiting tasks, rather than cascading errors. Removing from the local queue never deletes uploaded parts; cloud removal still requires the existing explicit confirmation.

## Existing pipeline preserved

Uses the unchanged authenticated begin/part/finish APIs and existing immutable 8 MiB part manifests, quota, asset leases and checks. No database migration, credentials, bucket access policy, rendering/YouTube queue, published link or notification change. This change does NOT implement direct browser-to-bucket upload or claim faster throughput: each part still passes through the web service. Server-side rendering remains a separate Generate action after completed uploads.

A currently open old uploader is not hot-upgraded. Do not refresh a long-running upload merely to obtain the new controls. Let it finish, or pause and deliberately reload/reselect to resume saved parts.

## Verification

Executable queue tests cover page subscriber removal, cross-fixture assignment, serial transfer, pause/resume, saved-hash mismatch, failure recovery without repeating completed files, duplicate enqueue and stop/forget safety. The existing browser suite retains its upload/resume/order/delete-confirmation checks and additionally unmounts the actual match uploader while a delayed multipart transfer continues, queues another fixture and checks both destinations in Chromium/WebKit at phone/desktop widths. A layout contract runs before/after prebuild to ensure source preparation cannot move/remove the shared owner.

Local queue tests use the actual queue/policy with mocked transport; browser, full build and production deployment status must be verified separately. Production authenticated navigation with a real customer file is not implied by isolated tests.
