# PlayerPool awaiting-profile reminders

The PlayerPool admin page includes an **Email all awaiting profiles** action for players whose profile status is `INVITED` and whose profile has not been submitted.

Each reminder uses the editable `player-pool-profile-reminder-email` System Template and the player's existing secure profile-completion URL. Completed, paused, joined and otherwise non-awaiting profiles are excluded server-side.

Every attempted email is recorded as a `NotificationDispatch` with source type `PLAYER_POOL_PROFILE_REMINDER`. The PlayerPool card displays the latest reminder time, status, sender and total count. Individual **Nudge** sends use the same reminder service and history.

The dedicated GitHub workflow runs the production preparation chain, the PlayerPool reminder contract, Prisma generation and validation, TypeScript checking, and a complete Next.js production build with inert CI-only service configuration.
