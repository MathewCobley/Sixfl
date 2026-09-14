## What changes

Describe the user-visible or operational change.

## Canonical workstream

- Workstream: <!-- e.g. referee dashboard / Veo / kits / results -->
- Supersedes: <!-- #123, or None -->
- Related open PRs checked: <!-- #123, #456, or None -->

> One problem should have one active implementation PR. If this PR replaces an older attempt, name it above and close the older PR once this replacement is ready.

## Safety / data impact

- Database migration: No / Yes — explain
- Sends email/SMS automatically: No / Yes — explain
- Changes payments/charges/credits: No / Yes — explain
- Production data mutation during testing: No

## Verification

- [ ] Branch was created from current `main`
- [ ] Existing open PRs were checked for overlapping production files
- [ ] Relevant focused tests/checks pass
- [ ] Preview deployment is verified when the change affects UI/navigation
- [ ] Required GitHub checks pass before merge
- [ ] After merge, the `main` production deployment is verified

## Status language

Do not call this **fixed/done/live** until the change is merged into `main` and the production deployment containing it has been verified.