# SIXFL communications rule

## Single communications system

Do not create separate email or SMS functions for individual areas of the site.

All outbound email and SMS must go through the shared SIXFL communications/notification system:

- shared notification recipients
- shared notification templates
- shared dispatch queue
- shared message thread/history records
- shared admin Communications UI

## Admin UI rule

Feature pages such as Teams, Leads, Prospects, Referees, Fixtures and Leagues may show a **Comms** button, but they should not contain their own standalone email or SMS composer.

The button should open the central Communications flow with the relevant record preselected where possible.

## Allowed local shortcuts

A local page may show a shortcut such as:

- Comms
- Open communications
- View comms history

But it must not add a separate send-email or send-SMS form.

## Referee communications

Referee email and SMS must use the same Communications system as teams, leads and prospects. Referee profile pages should show comms history and a Comms shortcut, not a separate referee-only SMS/email panel.

## Reason

Keeping all messaging in one system avoids missing history, duplicated templates, inconsistent audit trails, and different behaviour between teams, prospects, leads and referees.
