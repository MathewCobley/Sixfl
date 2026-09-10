# Team-logo function packaging

The reported Vercel functions `/api/admin/teams/logo-export` and
`/admin/teams/logos` were 576.23 MB and 575.61 MB respectively. The build log
included 220.92 MB of `.git/objects/pack` and unrelated `public/Kits` assets.
The existing exclusions covered different Night Fixtures and social-image routes.

## Native dependency boundaries

`src/lib/exports/team-logo-catalogue.ts` owns the unchanged read-only metadata
query. The selector page imports only this catalogue, not the ZIP writer, asset
reader or image processor. The exporter imports the same catalogue; no duplicate
team-selection or standings implementation is added.

`src/lib/exports/team-logo-assets.ts` no longer reads dynamic filesystem paths.
Uploaded SIXFL badges still come directly from the full-size database image,
never thumbnails. Public-file artwork is fetched from its original static path
on the configured public HTTPS site (fallback `https://sixfl.co.uk`), through the
existing bounded, DNS-pinned, private-address-blocking image reader. Query
transformations are ignored for these local artwork paths, as with the former
filesystem read. All public formats/paths remain supported, including unusual
existing assignments outside a team-logo directory. No kit image or badge is
removed from public/static deployment.

Public-file exports now need the public artwork endpoint to be reachable; errors
remain explicit in the export report. There is no internal authenticated fetch,
cookie forwarding, image transformation, provider credential or retry loop.
Existing 8 MB/image, 64 MB/export, time limits, SVG checks, admin/same-origin
checks, selected-team filtering and ZIP integrity protections remain in place.

Next tracing excludes `.git` from functions and `public` only from these two
routes, because they do not read public files at runtime anymore. Earlier narrow
Night Fixtures/social-image exclusions are retained.

## Release gate

`.github/workflows/vercel-function-bundles.yml` builds the actual Vercel output
with pinned CLI 59.11.7 and isolated local project settings. It uses no account,
Vercel token, production database, `vercel pull` or deployment action.
`scripts/check-vercel-function-bundles.mjs` measures every `.func` package by
uncompressed ZIP-entry size. Internal dependency aliases count as UTF-8 symlink
entries, matching `createZip` in Vercel's `packages/build-utils/src/lambda.ts`;
they are not additional copies of Prisma/canvas. Outside-source links are
conservatively materialised. Missing or cyclic targets fail closed. Different
regular-file names (including hard links) count separately. Identical package
directories behind route/RSC aliases are measured once and reported for each route.

The gate rejects missing output/routes, any bundle above 230 MiB (headroom below
the standard 250 MiB limit), Git/environment files, or public files in either
logo function. Negative controls cover oversized sparse files and aliased targets,
Git/public pollution and missing routes. An independent Unix-symlink ZIP fixture
cross-checks the uncompressed size calculation rather than increasing the budget
to accommodate double-counted dependency aliases.

Native and production-prepared export/catalogue/asset tests run alongside the
existing security/ZIP/browser tests and critical/DOM contracts. Every public
image in Vercel static output is compared byte-for-byte with its source.
Actual hosted Vercel and Railway deployment states must be checked separately;
a local package result alone is not confirmation of a live customer download.

No payment, fixture, player, badge or team records are changed; no customer
messages are sent. No platform plan, large-function option, environment setting,
production migration or branch-protection override is part of this correction.
