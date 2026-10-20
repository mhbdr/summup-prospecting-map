// Tests for the pure logic (no browser, no npm packages needed): node scripts/test-logic.mjs
import assert from 'node:assert/strict';
import { ARRONDISSEMENTS, matchesArrondissement, getArrondissement } from '../src/lib/arrondissements.js';
import { safeUrl, distanceMeters, formatDistance } from '../src/lib/format.js';
import { buildCsv, paymentLabel } from '../src/lib/records.js';
import { normalizeBusiness } from '../src/lib/sources.js';

let passed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log('ok  ', name); }
  catch (e) { console.error('FAIL', name, '\n    ', e.message); process.exitCode = 1; }
};

await test('arrondissements: 20 entries, valid boxes, postcode matching', () => {
  assert.equal(ARRONDISSEMENTS.length, 20);
  for (const a of ARRONDISSEMENTS) {
    const [s, w, n, e] = a.bounds;
    assert.ok(s < n && w < e, `box ${a.number}`);
    assert.ok(s > 48.8 && n < 48.92 && w > 2.2 && e < 2.5, `inside Paris ${a.number}`);
  }
  const a11 = getArrondissement(11);
  assert.ok(matchesArrondissement({ postcode: '75011', lat: 0, lon: 0 }, a11));
  assert.ok(!matchesArrondissement({ postcode: '75012', lat: 48.859, lon: 2.379 }, a11));
  assert.ok(matchesArrondissement({ postcode: '', lat: 48.859, lon: 2.379 }, a11));
  assert.ok(matchesArrondissement({ postcode: '75116', lat: 0, lon: 0 }, getArrondissement(16)));
  assert.ok(matchesArrondissement({ postcode: '75011', lat: 0, lon: 0 }, null));
});

await test('safeUrl blocks javascript: and fixes bare domains', () => {
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('data:text/html,hi'), null);
  assert.equal(safeUrl('chez-a.fr'), 'https://chez-a.fr/');
  assert.equal(safeUrl('http://x.org/a'), 'http://x.org/a');
  assert.equal(safeUrl(''), null);
});

await test('distance helpers', () => {
  const d = distanceMeters(48.8584, 2.2945, 48.8606, 2.3376); // Eiffel Tower -> Louvre
  assert.ok(d > 3000 && d < 3400, String(d));
  assert.equal(formatDistance(430), '430 m');
  assert.equal(formatDistance(1520), '1.5 km');
});

await test('records: CSV export + legacy record shape from the old app', () => {
  const legacy = { 'node/42': {
    payment: 'card', visit: 'interested', notes: 'ask for "Marie", "best" at 9', updatedAt: '2026-10-01T10:00:00Z',
    business: { id: '42', type: 'node', source: 'OpenStreetMap', coordinates: [48.85, 2.35], tags: { name: 'Old Shop', shop: 'florist', 'addr:street': 'Rue Y', 'addr:housenumber': '2' } },
  } };
  assert.equal(normalizeBusiness(legacy['node/42'].business).name, 'Old Shop');
  const csv = buildCsv(legacy);
  assert.match(csv, /"Old Shop"/);
  assert.match(csv, /"Card accepted · verified"/);
  assert.match(csv, /""Marie""/); // quotes escaped
  assert.equal(buildCsv({}), null);
  assert.equal(paymentLabel('weird'), 'Not verified');
});

console.log(`\n${passed} passed`);
