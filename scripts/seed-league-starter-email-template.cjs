const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const CAMPAIGN_TEMPLATE_KEY = 'league-starter-guide';
const NEW_LEAGUE_SYSTEM_TEMPLATE_KEY = 'team-lead-reassurance-email';
const LIVE_LEAGUE_SYSTEM_TEMPLATE_KEY = 'team-lead-reassurance-live-email';
const SYSTEM_SMS_TEMPLATE_KEY = 'team-lead-reassurance-sms';
const DEFAULT_SUBJECT = 'Everything you need to know about joining SIXFL ⚽';
const DEFAULT_LIVE_SUBJECT =
  'Join SIXFL {{leagueName}} — the league is already underway ⚽';
const DEFAULT_CTA_LABEL = 'YES — I WANT TO ENTER A TEAM';
const DEFAULT_LIVE_CTA_LABEL = 'YES — I WANT TO JOIN THIS LEAGUE';
const DEFAULT_SMS_BODY =
  'Hi {{firstName}}, it’s SIXFL. We’ve just emailed you the full details for {{leagueName}}, including the costs and a short team confirmation link. Please check your junk or spam folder if you can’t see it. Thanks, SIXFL';
const OLD_BENEFIT_LINE = '✅ A properly structured local competition';
const NEW_BENEFIT_LINE = '✅ Games recorded and displayed on YouTube';

function updateYouTubeBenefit(value) {
  const body = value?.trim();
  if (!body) return null;
  return body.replaceAll(OLD_BENEFIT_LINE, NEW_BENEFIT_LINE);
}

const DEFAULT_BODY = `Hi {{firstName}},

Thanks for your interest in joining SIXFL {{leagueName}} ⚽

If you’re thinking about entering a team, here’s everything you need to know. We’ve tried to make getting started as simple as possible.

⚽ YOUR SIXFL LEAGUE

📍 Venue: {{venueName}}
📅 Match night: {{matchNight}}
🕐 Kick-offs: {{kickoffInfo}}
🏁 Planned start: {{proposedStartDate}}
💷 Cost: {{costPerTeamPerMatch}} per team, per match

That’s the team price, not per player.

For example, with 8 players, that works out at around {{eightPlayerShare}} each for the match.

🏆 WHAT DO YOU GET?

SIXFL is designed to feel like a proper football league rather than just turning up for a casual game.

✅ Regular organised league fixtures
✅ Referees and match-night management
✅ Live league tables, fixtures and results
✅ Your own team and player accounts
✅ Team statistics and match information
✅ SIXFL AI match predictions
✅ Games recorded and displayed on YouTube

6-a-side football. Done properly.

👥 HOW MANY PLAYERS DO I NEED?

Matches are 6-a-side.

You can use up to 9 players on a match night:

6 players + up to 3 rolling substitutes

Your overall squad can be bigger than nine — you simply choose which players are playing each fixture.

Don’t have every player confirmed yet?

That’s OK.

You can still get your team started while you organise the rest of your squad.

🚀 HOW GETTING STARTED WORKS

1️⃣ Confirm you want to enter
We already have your contact details from your enquiry, so there is no need to fill them in again.

2️⃣ Tell us your team name
If you have decided it, add it now. If not, you can confirm it later.

3️⃣ We get the league ready
As teams commit, we confirm the league, venue, start date and match-night details.

4️⃣ Start playing
Once the league launches, your fixtures, results and league table are all managed through SIXFL.

💷 WHAT DO I PAY — AND AM I TIED IN?

The standard match fee is {{costPerTeamPerMatch}} per team for each weekly fixture.

Simply confirming you want to enter does not mean you are suddenly being charged match fees.

There’s no long-term contract tying your team in. You pay for your football as you play.

We also know that running an amateur football team means there will occasionally be weeks when you simply can’t get a team together — holidays, work commitments and other plans happen.

If you know in advance that your team can’t play on a particular week, let us know and we’ll do our best to work around it when arranging the fixtures.

The more notice you can give us, the easier it is for us to accommodate.

You can also tell us about a one-off time restriction — for example, if your team can play one week but only after 8pm.

We organise the league to make regular football easy to fit around real life, not to tie teams into something they can’t manage.

🏆 INTERESTED, BUT NOT QUITE READY?

You do not need to have everything organised today.

Maybe you:
• still need another player or two
• need to check with your mates
• haven’t decided on a team name
• want to know a little more about the league first

That’s completely fine.

When you are ready to move forward, use the button below. We already have your details — it is simply your way of telling us you want to enter a team.

{{cta}}

GOT A QUESTION?

Just reply to this email.

We’re happy to help and there’s no need to figure everything out on your own.

See you on the pitch,

SIXFL

6-a-side football. Done properly.`;

const DEFAULT_LIVE_BODY = `Hi {{firstName}},

Thanks for your interest in joining SIXFL {{leagueName}} ⚽

This league is already up and running, so your team does not need to wait for a new season to begin.

Once you confirm that you would like to join, we’ll check the available space and contact you to agree the most suitable first playing week.

⚽ YOUR SIXFL LEAGUE

📍 Venue: {{venueName}}
📅 Match night: {{matchNight}}
🕐 Kick-offs: {{kickoffInfo}}
⚽ League status: Already underway
🚀 Your start: We’ll agree your first playing week with you
💷 Cost: {{costPerTeamPerMatch}} per team, per match

That’s the team price, not per player.

For example, with 8 players, that works out at around {{eightPlayerShare}} each for the match.

🏆 WHAT DO YOU GET?

SIXFL is designed to feel like a proper football league rather than just turning up for a casual game.

✅ Regular organised league fixtures
✅ Referees and match-night management
✅ Live league tables, fixtures and results
✅ Your own team and player accounts
✅ Team statistics and match information
✅ SIXFL AI match predictions
✅ Games recorded and displayed on YouTube

6-a-side football. Done properly.

👥 HOW MANY PLAYERS DO I NEED?

Matches are 6-a-side.

You can use up to 9 players on a match night:

6 players + up to 3 rolling substitutes

Your overall squad can be bigger than nine — you simply choose which players are playing each fixture.

Don’t have every player confirmed yet?

That’s OK.

You can still confirm that you want to join while you organise the rest of your squad.

🚀 HOW GETTING STARTED WORKS

1️⃣ Confirm you want to join
We already have your contact details from your enquiry, so there is no need to fill them in again.

2️⃣ Tell us your team name
If you have decided it, add it now. If not, you can confirm it later. You can also tell us roughly how many players you currently have.

3️⃣ We agree your starting week
We’ll check the available space in the running league and contact you to arrange the most suitable first fixture.

4️⃣ Set up your squad and start playing
We’ll create your SIXFL team account so you can invite your players. Your fixtures, results, league position, statistics and recorded matches will then appear through SIXFL.

💷 WHAT DO I PAY — AND AM I TIED IN?

The standard match fee is {{costPerTeamPerMatch}} per team for each weekly fixture.

Simply confirming that you want to join does not mean you are suddenly being charged match fees.

There’s no long-term contract tying your team in. You pay for your football as you play.

We also know that running an amateur football team means there will occasionally be weeks when you simply can’t get a team together — holidays, work commitments and other plans happen.

If you know in advance that your team can’t play on a particular week, let us know and we’ll do our best to work around it when arranging the fixtures.

The more notice you can give us, the easier it is for us to accommodate.

You can also tell us about a one-off time restriction — for example, if your team can play one week but only after 8pm.

We organise the league to make regular football easy to fit around real life, not to tie teams into something they can’t manage.

🏆 INTERESTED, BUT NOT QUITE READY?

You do not need to have everything organised today.

Maybe you:
• still need another player or two
• need to check with your mates
• haven’t decided on a team name
• want to know a little more about joining the league first

That’s completely fine.

When you are ready to move forward, use the button below. We already have your details — it is simply your way of telling us that you want to join this league.

{{cta}}

GOT A QUESTION?

Just reply to this email.

We’re happy to help and there’s no need to figure everything out on your own.

See you on the pitch,

SIXFL

6-a-side football. Done properly.`;

async function main() {
  const [campaignTemplate, newLeagueSystemTemplate, liveLeagueSystemTemplate] =
    await Promise.all([
      prisma.emailTemplate.findUnique({
        where: { key: CAMPAIGN_TEMPLATE_KEY },
        select: {
          name: true,
          description: true,
          subject: true,
          body: true,
          ctaLabel: true,
        },
      }),
      prisma.notificationTemplate.findUnique({
        where: { key: NEW_LEAGUE_SYSTEM_TEMPLATE_KEY },
        select: {
          name: true,
          description: true,
          subject: true,
          body: true,
          ctaLabel: true,
        },
      }),
      prisma.notificationTemplate.findUnique({
        where: { key: LIVE_LEAGUE_SYSTEM_TEMPLATE_KEY },
        select: { ctaLabel: true },
      }),
    ]);

  const sourceTemplate = campaignTemplate || newLeagueSystemTemplate;
  const updatedBody =
    updateYouTubeBenefit(campaignTemplate?.body) ||
    updateYouTubeBenefit(newLeagueSystemTemplate?.body) ||
    DEFAULT_BODY;

  await prisma.notificationTemplate.upsert({
    where: { key: NEW_LEAGUE_SYSTEM_TEMPLATE_KEY },
    update: {
      ...(campaignTemplate
        ? {
            subject: campaignTemplate.subject.trim() || DEFAULT_SUBJECT,
          }
        : {}),
      name: 'Team lead reassurance email — new league',
      description:
        campaignTemplate?.description?.trim() ||
        newLeagueSystemTemplate?.description?.trim() ||
        'Friendly starter information for a team lead joining a league that has not started yet.',
      body: updatedBody,
      kind: 'TRANSACTIONAL',
      channel: 'EMAIL',
      audience: 'LEAD',
      ctaLabel:
        campaignTemplate?.ctaLabel?.trim() ||
        newLeagueSystemTemplate?.ctaLabel?.trim() ||
        DEFAULT_CTA_LABEL,
      ctaUrlKey: 'signupUrl',
      isActive: true,
    },
    create: {
      key: NEW_LEAGUE_SYSTEM_TEMPLATE_KEY,
      name: 'Team lead reassurance email — new league',
      description:
        sourceTemplate?.description?.trim() ||
        'Friendly starter information for a team lead joining a league that has not started yet.',
      kind: 'TRANSACTIONAL',
      channel: 'EMAIL',
      audience: 'LEAD',
      subject: sourceTemplate?.subject?.trim() || DEFAULT_SUBJECT,
      body: updatedBody,
      ctaLabel: sourceTemplate?.ctaLabel?.trim() || DEFAULT_CTA_LABEL,
      ctaUrlKey: 'signupUrl',
      isActive: true,
    },
  });

  await prisma.notificationTemplate.upsert({
    where: { key: LIVE_LEAGUE_SYSTEM_TEMPLATE_KEY },
    update: {
      name: 'Team lead reassurance email — live league',
      description:
        'Friendly information for a team lead joining a league that is already underway.',
      kind: 'TRANSACTIONAL',
      channel: 'EMAIL',
      audience: 'LEAD',
      ctaLabel:
        liveLeagueSystemTemplate?.ctaLabel?.trim() || DEFAULT_LIVE_CTA_LABEL,
      ctaUrlKey: 'signupUrl',
      isActive: true,
    },
    create: {
      key: LIVE_LEAGUE_SYSTEM_TEMPLATE_KEY,
      name: 'Team lead reassurance email — live league',
      description:
        'Friendly information for a team lead joining a league that is already underway.',
      kind: 'TRANSACTIONAL',
      channel: 'EMAIL',
      audience: 'LEAD',
      subject: DEFAULT_LIVE_SUBJECT,
      body: DEFAULT_LIVE_BODY,
      ctaLabel: DEFAULT_LIVE_CTA_LABEL,
      ctaUrlKey: 'signupUrl',
      isActive: true,
    },
  });

  await prisma.notificationTemplate.upsert({
    where: { key: SYSTEM_SMS_TEMPLATE_KEY },
    update: {
      kind: 'TRANSACTIONAL',
      channel: 'SMS',
      audience: 'LEAD',
      subject: null,
      ctaLabel: null,
      ctaUrlKey: null,
      isActive: true,
    },
    create: {
      key: SYSTEM_SMS_TEMPLATE_KEY,
      name: 'Team lead reassurance SMS',
      description:
        'Automatic SMS sent with a team lead reassurance email, prompting the lead to check their inbox and junk folder.',
      kind: 'TRANSACTIONAL',
      channel: 'SMS',
      audience: 'LEAD',
      subject: null,
      body: DEFAULT_SMS_BODY,
      ctaLabel: null,
      ctaUrlKey: null,
      isActive: true,
    },
  });

  await prisma.emailTemplate.deleteMany({
    where: { key: CAMPAIGN_TEMPLATE_KEY },
  });

  console.log(
    'New-league and live-league reassurance emails, plus the reassurance SMS, are available in System Templates.',
  );
}

main()
  .catch((error) => {
    console.error('team lead reassurance template migration failed', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
