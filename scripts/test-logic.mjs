// Tests for the pure logic (no browser, no npm packages needed): node scripts/test-logic.mjs
import assert from 'node:assert/strict';
import { resolveQuery, normalize } from '../src/lib/categories.js';
import { ARRONDISSEMENTS, matchesArrondissement, getArrondissement } from '../src/lib/arrondissements.js';
import { formatAddress, safeUrl, distanceMeters, formatDistance, hoursLines } from '../src/lib/format.js';
import {
  snapBounds, boundsContain, buildQuery, parseElements, fetchBusinesses, cacheKey,
  __setMinGap, __clearCache,
} from '../src/lib/overpass.js';
import { buildCsv, paymentLabel } from '../src/lib/records.js';
import { normalizeBusiness } from '../src/lib/sources.js';

let passed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log('ok  ', name); }
  catch (e) { console.error('FAIL', name, '\n    ', e.message); process.exitCode = 1; }
};

await test('resolveQuery: English, French, accents, prefix, free text', () => {
  assert.equal(resolveQuery('bakery').label, 'Bakery');
  assert.equal(resolveQuery('Boulangerie').label, 'Bakery');
  assert.equal(resolveQuery('  CAFÉ ').label, 'Café');
  assert.equal(resolveQuery('pharm').label, 'Pharmacy');
  assert.equal(resolveQuery('supermarché').label, 'Supermarket');
  assert.equal(resolveQuery('Monoprix').kind, 'name');
  assert.equal(resolveQuery(''), null);
  assert.equal(resolveQuery('   '), null);
  assert.equal(normalize('Épicerie'), 'epicerie');
});

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

await test('snapBounds expands outward and is stable', () => {
  const b = [48.8561, 2.3512, 48.8603, 2.3577];
  const s = snapBounds(b);
  assert.ok(boundsContain(s, b));
  assert.deepEqual(snapBounds([48.8562, 2.3513, 48.8604, 2.3579]), s); // small pan -> same key
});

await test('buildQuery: category + name search, escaping', () => {
  const q = buildQuery(resolveQuery('bar'), [48.85, 2.35, 48.86, 2.36]);
  assert.match(q, /\[out:json\]/);
  assert.match(q, /nwr\["amenity"="bar"\]\["name"\]\(48\.85,2\.35,48\.86,2\.36\);/);
  assert.match(q, /nwr\["amenity"="pub"\]/);
  assert.match(q, /out center tags 300;/);
  const evil = buildQuery({ kind: 'name', term: 'a"b(c)\\', key: 'x' }, [1, 2, 3, 4]);
  assert.ok(!/"a"b/.test(evil));
  assert.match(evil, /a\\"b\\\\\(c\\\\\)\\\\\\\\/);
});

await test('parseElements: node, way center, nameless skipped, dedup', () => {
  const items = parseElements({ elements: [
    { type: 'node', id: 1, lat: 48.85, lon: 2.35, tags: { name: 'Chez A', shop: 'bakery', 'addr:housenumber': '5', 'addr:street': 'Rue X', 'addr:postcode': '75011', opening_hours: 'Mo-Fr 07:00-20:00; Sa 08:00-13:00', website: 'chez-a.fr' } },
    { type: 'way', id: 2, center: { lat: 48.86, lon: 2.36 }, tags: { name: 'B', amenity: 'cafe' } },
    { type: 'node', id: 3, lat: 48.8, lon: 2.3, tags: { shop: 'bakery' } },
    { type: 'node', id: 1, lat: 48.85, lon: 2.35, tags: { name: 'Chez A dup', shop: 'bakery' } },
  ] });
  assert.equal(items.length, 2);
  assert.equal(items[0].key, 'node/1');
  assert.equal(items[0].kind, 'bakery');
  assert.equal(formatAddress(items[0]), '5 Rue X, 75011');
  assert.equal(items[1].lat, 48.86);
  assert.deepEqual(hoursLines(items[0].hours), ['Mo-Fr 07:00-20:00', 'Sa 08:00-13:00']);
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

await test('fetchBusinesses: caches, falls back to mirror, dedupes in-flight, respects abort', async () => {
  __setMinGap(0);
  __clearCache();
  const calls = [];
  const okBody = { elements: [{ type: 'node', id: 9, lat: 48.85, lon: 2.35, tags: { name: 'Z', shop: 'bakery' } }] };
  globalThis.fetch = async (url, init) => {
    calls.push(url);
    if (calls.length === 1) return new Response('busy', { status: 504 });
    return new Response(JSON.stringify(okBody), { status: 200 });
  };
  const search = resolveQuery('bakery');
  const bounds = snapBounds([48.85, 2.35, 48.86, 2.36]);
  const r1 = await fetchBusinesses(search, bounds);
  assert.equal(r1.items.length, 1);
  assert.equal(r1.fromCache, false);
  assert.equal(calls.length, 2, 'first endpoint 504 -> second endpoint used');
  assert.notEqual(calls[0], calls[1]);
  const r2 = await fetchBusinesses(search, bounds);
  assert.equal(r2.fromCache, true);
  assert.equal(calls.length, 2, 'second call served from cache');

  __clearCache();
  calls.length = 0;
  globalThis.fetch = async () => { calls.push(1); await new Promise((r) => setTimeout(r, 20)); return new Response(JSON.stringify(okBody), { status: 200 }); };
  const [a, b] = await Promise.all([fetchBusinesses(search, bounds), fetchBusinesses(search, bounds)]);
  assert.equal(calls.length, 1, 'identical concurrent requests share one fetch');
  assert.equal(a.items.length, b.items.length);

  __clearCache();
  const ctl = new AbortController();
  globalThis.fetch = async (_u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' }))));
  const p = fetchBusinesses(search, bounds, { signal: ctl.signal });
  setTimeout(() => ctl.abort(), 10);
  await assert.rejects(p, (e) => e.name === 'AbortError');
});

await test('fetchBusinesses: joining a cancelled in-flight request still succeeds', async () => {
  __setMinGap(0); __clearCache();
  const okBody = { elements: [{ type: 'node', id: 5, lat: 48.85, lon: 2.35, tags: { name: 'Q', shop: 'bakery' } }] };
  let n = 0;
  globalThis.fetch = async (_u, init) => {
    n++;
    await new Promise((r) => setTimeout(r, 30));
    if (init.signal.aborted) throw Object.assign(new Error('x'), { name: 'AbortError' });
    return new Response(JSON.stringify(okBody), { status: 200 });
  };
  const search = resolveQuery('bakery');
  const bounds = [7, 7, 8, 8];
  const first = new AbortController();
  const p1 = fetchBusinesses(search, bounds, { signal: first.signal }).catch((e) => e);
  await new Promise((r) => setTimeout(r, 5));
  first.abort(); // user panned away
  const second = await fetchBusinesses(search, bounds, { signal: new AbortController().signal });
  assert.equal(second.items.length, 1);
  assert.equal((await p1).name, 'AbortError');
});

await test('fetchBusinesses: throttle spaces requests', async () => {
  __setMinGap(120);
  __clearCache();
  const stamps = [];
  globalThis.fetch = async () => { stamps.push(Date.now()); return new Response(JSON.stringify({ elements: [] }), { status: 200 }); };
  await fetchBusinesses(resolveQuery('bakery'), [1, 1, 2, 2]);
  await fetchBusinesses(resolveQuery('bar'), [1, 1, 2, 2]);
  assert.ok(stamps[1] - stamps[0] >= 100, `gap ${stamps[1] - stamps[0]}ms`);
  __setMinGap(0);
});

await test('failure after all mirrors gives a readable error', async () => {
  __setMinGap(0); __clearCache();
  globalThis.fetch = async () => new Response('too many', { status: 429 });
  await assert.rejects(fetchBusinesses(resolveQuery('bakery'), [5, 5, 6, 6]), /rate-limiting/);
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

await test('cacheKey differs per query and per area', () => {
  assert.notEqual(cacheKey(resolveQuery('bar'), [1, 2, 3, 4]), cacheKey(resolveQuery('bakery'), [1, 2, 3, 4]));
  assert.notEqual(cacheKey(resolveQuery('bar'), [1, 2, 3, 4]), cacheKey(resolveQuery('bar'), [1, 2, 3, 5]));
});

console.log(`\n${passed} passed`);
