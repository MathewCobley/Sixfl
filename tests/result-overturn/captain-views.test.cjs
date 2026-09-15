const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renderCaptainView } = require('./captain-view-fixtures.cjs');
const text = html => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');

test('actual overview card names the awarded result, original score and brief public reason for both captains', async () => {
  for (const teamid of ['nomads', 'under']) {
    const { rowHtml, html } = await renderCaptainView({ teamid });
    assert.match(text(rowHtml), teamid === 'nomads' ? /AWARDED WIN.*Awarded 3 - 0/ : /AWARDED LOSS.*Awarded 0 - 3/);
    assert.match(text(rowHtml), /Original on-pitch result: Northallerton Nomads 1–4 Under Sixes/);
    assert.match(text(rowHtml), /Official awarded result: Northallerton Nomads 3–0 Under Sixes/);
    assert.match(text(rowHtml), /Default win awarded to Northallerton Nomads/);
    assert.match(rowHtml, /Player-limit breach/); assert.doesNotMatch(html, /SECRET_/);
    assert.match(text(html), /Action needed\s*0\s*Results still need scorers/, 'awarded goals must not generate false missing-scorer reminders');
  }
});

test('unchanged played results keep normal WIN/LOSS presentation and do not invent a breach', async () => {
  for (const teamid of ['nomads', 'under']) {
    const { rowHtml } = await renderCaptainView({ teamid, awarded: false });
    assert.match(text(rowHtml), teamid === 'nomads' ? /LOSS\s*Lost 1 - 4/ : /WIN\s*Won 4 - 1/);
    assert.doesNotMatch(rowHtml, /AWARDED|Overturned|Original on-pitch|Rule breach/);
  }
});

test('current captain linked to the historical team sees the same correctly oriented decision', async () => {
  const { rowHtml } = await renderCaptainView({ alias: true });
  assert.match(text(rowHtml), /AWARDED WIN.*Awarded 3 - 0/);
  assert.match(text(rowHtml), /Northallerton Nomads 1–4 Under Sixes/);
});

test('Results history shows both scores and judges predictions against the original on-field performance', async () => {
  for (const teamid of ['nomads', 'under']) {
    const { html } = await renderCaptainView({ kind: 'history', teamid });
    assert.match(text(html), /Northallerton Nomads 1–4 Under Sixes/);
    assert.match(text(html), /Northallerton Nomads 3–0 Under Sixes/);
    assert.match(text(html), /Awarded result/); assert.match(text(html), /Player-limit breach/);
    assert.match(text(html), /Exact score/); assert.doesNotMatch(text(html), /Prediction missed|SECRET_/);
    const missed = await renderCaptainView({ kind: 'history', teamid, prediction: [3, 0] });
    assert.match(text(missed.html), /Prediction missed/); assert.doesNotMatch(text(missed.html), /Exact score/);
  }
  const normal = await renderCaptainView({ kind: 'history', awarded: false });
  assert.match(text(normal.html), /Actual result/); assert.match(text(normal.html), /Exact score/);
  assert.doesNotMatch(text(normal.html), /Overturned|Rule breach/);
});

test('both views still require the requesting team captain', async () => {
  for (const kind of ['overview', 'history']) await assert.rejects(renderCaptainView({ kind, allowed: false }), /Forbidden/);
});
