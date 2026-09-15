# SIXFL CI queue policy

SIXFL has a large set of feature-specific regression workflows. They protect useful behaviour, but running every feature workflow for every pull request or every merge to `main` can exhaust GitHub Actions runner capacity and delay the small set of checks that actually gate a merge.

## Default policy

- `DOM bridge policy` remains a required, broad pull-request safety check.
- `SIXFL critical feature contracts` remains a broad pull-request regression check.
- Feature-specific workflows should use `pull_request.paths` so they only start when their owned production/test files change.
- Pull-request workflows should define a concurrency group based on the PR number (or ref for manual runs) and set `cancel-in-progress: true` so a newer commit supersedes an obsolete run.
- Feature workflows should not repeat their full test suite on every push to `main`. Production deployment and the pull-request checks are the normal post-merge verification path.
- A workflow can still expose `workflow_dispatch` when a full manual rerun is useful.

## Guardrail

`CI workflow scope policy` checks workflow files changed by a pull request. New or modified feature workflows must be path-scoped, must cancel superseded runs, and must not add an unconditional `main` push trigger. The small core safety allow-list stays deliberately broad.

This policy changes when tests run, not what the tests assert. Feature tests and safety contracts are not weakened or deleted.
