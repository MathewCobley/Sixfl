const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const body = `Hi {{firstName}},

Thanks for your interest in joining SIXFL {{leagueName}} ⚽

If you’re thinking about entering a team, here’s everything you need to know. We’ve tried to make getting started as simple as possible.

⚽ YOUR SIXFL LEAGUE

📍 Venue: {{venueName}}
🕐 Kick-offs: {{kickoffInfo}}
🏁 Planned start: {{proposedStartDate}}
💷 Cost: {{costPerTeamPerMatch}} per team, per match

That’s the team price, not per player.

For example, at £40 with 8 players, that works out at just £5 each for the match.

🏆 WHAT DO YOU GET?

SIXFL is designed to feel like a proper football league rather than just turning up for a casual game.

✅ Regular organised league fixtures
✅ Referees and match-night management
✅ Live league tables, fixtures and results
✅ Your own team and player accounts
✅ Team statistics and match information
✅ SIXFL AI match predictions
✅ A properly structured local competition

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

const templateData = {
  name: 'League starter guide',
  description: 'Friendly starter email for existing team leads. The CTA uses their secure lead record so they confirm intent without re-entering contact details.',
  audience: 'LEAD',
  interestType: 'TEAM',
  subject: 'Everything you need to know about joining SIXFL ⚽',
  body,
  ctaLabel: 'YES — I WANT TO ENTER A TEAM',
  ctaUrlKey: 'teamConfirmationUrl',
  isActive: true,
};

async function main() {
  await prisma.emailTemplate.upsert({
    where: { key: 'league-starter-guide' },
    update: templateData,
    create: {
      key: 'league-starter-guide',
      ...templateData,
    },
  });

  console.log('League starter guide email template is available.');
}

main()
  .catch((error) => {
    console.error('league starter template seed failed', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
