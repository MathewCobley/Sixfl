const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { load } = require('../result-overturn/loader.cjs');

// Render the owning admin route, not a miniature replica of the email panel.
// Only auth, read-only data and server-action boundaries are substituted.
async function renderReferralLayout() {
  const forbidden = () => { throw new Error('Layout checks must not write or send'); };
  const recordedAt = new Date('2026-09-12T18:56:00Z');
  const base = {
    referrerUserId: 'test-player', referrerName: 'Example Referrer',
    referrerEmail: 'a-deliberately-long-referrer-address@example.invalid',
    teamName: 'Example Renamed Football Club', leagueName: 'Example Tuesday League',
    createdAt: recordedAt, requiredMatches: 3, completedMatches: 0, rewardPence: 7500,
    payoutDetailsSubmittedAt: null, paidAt: null, ineligibleAt: null, ineligibleReasonCode: null,
  };
  const rows = [
    { ...base, id: 'ineligible', ineligibleAt: recordedAt, ineligibleReasonCode: 'EXISTING_TEAM' },
    { ...base, id: 'tracking', teamName: 'New team' },
    { ...base, id: 'ready', teamName: 'Qualifying team', completedMatches: 3 },
    { ...base, id: 'paid', teamName: 'Paid team', completedMatches: 3, paidAt: recordedAt },
  ];
  const panel = {
    email: base.referrerEmail, error: null, subject: 'Update on your SIXFL referral',
    body: 'Hi Example,\n\nThis referral does not qualify for the reward.\n\nReason: Existing or renamed team.\n\nNo payment will be made for this referral.',
    record: { id: 'existing-queued-notice', status: 'QUEUED', failureReason: null },
  };
  const View = load('src/components/admin/ReferralIneligibilityEmailPanelView.tsx').default;
  const stubs = {
    './referrals.css': {},
    'next/link': { __esModule: true, default: p => React.createElement('a', { href: p.href, className: p.className }, p.children) },
    '@/lib/prisma': { prisma: { $queryRaw: async strings => strings.join('').includes('NotificationDispatch')
      ? rows.map(row => ({ referralId: row.id, dispatchId: 'original-' + row.id, status: 'SENT', sentAt: recordedAt })) : [] } },
    '@/lib/requireAdmin': { requireAdmin: async () => ({ user: { id: 'test-admin', role: 'ADMIN' } }) },
    '@/lib/team-referrals': { getTeamReferrals: async () => rows,
      referralStatus: row => row.ineligibleAt ? 'INELIGIBLE' : row.paidAt ? 'PAID' : row.completedMatches >= row.requiredMatches ? 'READY' : 'TRACKING' },
    '@/lib/team-referral-eligibility': { getReferralEligibilityAudit: async () => [
      { id: 'ineligible', ineligibleByName: 'Example administrator', ineligibleNote: 'PRIVATE_LAYOUT_SENTINEL: the team already played under a previous name.' },
    ] },
    '@/components/admin/ReferralIneligibilityEmailPanel': { __esModule: true, default: p => React.createElement(View, { referralId: p.referralId, action: forbidden, panel }) },
    './actions': { markReferralIneligibleAction: forbidden, emailIneligibleReferralAction: forbidden,
      attachExistingLeadReferralAction: forbidden, retryReferralRecordedEmailAction: forbidden },
  };
  const Page = load('src/app/(admin)/admin/referrals/page.tsx', stubs).default;
  const element = await Page({ searchParams: Promise.resolve({}) });
  const cards = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'article' && node.props?.className?.includes('sixfl-referral-card')) cards.push(node);
    for (const child of React.Children.toArray(node.props?.children)) visit(child);
  }
  visit(element);
  assert.equal(cards.length, 4);
  for (const card of cards) {
    const children = React.Children.toArray(card.props.children);
    assert.equal(children[0].props.className, 'sixfl-referral-summary');
    assert.equal(React.Children.toArray(children[0].props.children).length, 4);
    if (children[1]) assert.match(children[1].props.className, /sixfl-referral-details/);
  }
  return { html: renderToStaticMarkup(element), cardCount: cards.length };
}
module.exports = { renderReferralLayout };
