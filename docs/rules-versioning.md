# SIXFL rules versioning

SIXFL keeps dated, versioned rule documents so an earlier incident can be checked against the wording that was in force at the time.

## Active documents

The public League Rules, Match Rules and League Participation Agreement each show an active version and effective date. The source-of-truth constants live in `src/lib/league-rules.ts`, `src/lib/match-rules.ts` and `src/lib/league-agreement.ts`.

## Before publishing a new version

1. Copy the complete outgoing rule text into `src/lib/rules-archive.ts`.
2. Record the outgoing version, original effective date and superseded date.
3. Increase the active document version and effective date.
4. Update any captain-guide wording that summarises the changed rule.
5. Update the rules hardening contract if a new critical protection needs to be retained.

Do not overwrite or silently rewrite an archived version. If an archive entry is found to contain a transcription error, correct it with an explicit commit that explains the correction.

## Which version applies

Unless a change is required for safety or law, an incident should normally be assessed using the rules that were in force when the incident occurred. Publishing a stronger or clearer rule later must not be presented as though that wording existed earlier.

## Captain acceptance

New captain acceptances record `captainAgreementVersion`. Acceptances made before version tracking remain valid historical acceptances but are shown as `accepted before version tracking`; they must not be falsely attributed to a later rules version.

## Internal archive

Admins can view retained versions at `/admin/rules-archive` under **Back end functions**. Git history remains an additional audit trail, but the admin archive is the deliberate operational record of superseded versions.
