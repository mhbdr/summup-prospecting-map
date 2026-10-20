// Tests for the pure logic (no browser, no npm packages needed): node scripts/test-logic.mjs
import assert from 'node:assert/strict';
import { ARRONDISSEMENTS, matchesArrondissement, getArrondissement } from '../src/lib/arrondissements.js';
import { safeUrl, distanceMeters, formatDistance } from '../src/lib/format.js';
import { buildCsv, paymentLabel } from '../src/lib/records.js';
import { boundsSearchPoint, normalizeBusiness, searchNearbyBusinesses } from '../src/lib/sources.js';
import { addBusinessesWithoutDuplicates, isParisSourceApplicable, searchParisOpenData } from '../src/lib/parisOpenData.js';
import { BUSINESS_TYPES, getBusinessType } from '../src/lib/businessTypes.js';
import { buildAddressSearchUrl, buildAlgoliaQueryUrl, normalizeAddressResults, normalizeAlgoliaResults } from '../src/lib/apiDemo.js';

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

await test('API demo: public address URL and source-specific result normalization', () => {
  const addressUrl = new URL(buildAddressSearchUrl('  20 avenue de Ségur, Paris  '));
  assert.equal(addressUrl.origin, 'https://api-adresse.data.gouv.fr');
  assert.equal(addressUrl.pathname, '/search/');
  assert.equal(addressUrl.searchParams.get('q'), '20 avenue de Ségur, Paris');
  assert.equal(addressUrl.searchParams.get('limit'), '6');
  const addresses = normalizeAddressResults({
    features: [
      { geometry: { coordinates: [2.31, 48.85] }, properties: { id: 'addr-1', label: '20 avenue de Ségur', postcode: '75007', city: 'Paris' } },
      { geometry: { coordinates: [null, 48.8] }, properties: { label: 'Invalid' } },
    ],
  });
  assert.equal(addresses.length, 1);
  assert.deepEqual([addresses[0].lat, addresses[0].lon, addresses[0].source], [48.85, 2.31, 'api-adresse.data.gouv.fr']);
  assert.equal(addresses[0].subtitle, '75007 Paris');
  assert.equal(buildAlgoliaQueryUrl('AB12CD', 'shops fr'), 'https://AB12CD-dsn.algolia.net/1/indexes/shops%20fr/query');
  assert.throws(() => buildAlgoliaQueryUrl('bad host', 'shops'), /Application ID/);
  assert.throws(() => buildAlgoliaQueryUrl('AB12CD', ' '), /index/);
  const algolia = normalizeAlgoliaResults({ hits: [{ objectID: 'shop-1', name: 'Shop', address: 'Paris', _geoloc: { lat: '48.8', lng: '2.3' } }] });
  assert.deepEqual([algolia[0].title, algolia[0].lat, algolia[0].lon, algolia[0].source], ['Shop', 48.8, 2.3, 'Algolia']);
  assert.deepEqual(normalizeAlgoliaResults({ hits: [] }), []);
});

await test('distance helpers', () => {
  const d = distanceMeters(48.8584, 2.2945, 48.8606, 2.3376); // Eiffel Tower -> Louvre
  assert.ok(d > 3000 && d < 3400, String(d));
  assert.equal(formatDistance(430), '430 m');
  assert.equal(formatDistance(1520), '1.5 km');
});

await test('SIRENE nearby search: map radius, active geolocated businesses, and paging', async () => {
  assert.equal(getBusinessType('restaurant').activityCodes.includes('56.10A'), true);
  assert.equal(getBusinessType('clothing').activityCodes.includes('47.71Z'), true);
  assert.equal(getBusinessType('unknown'), null);
  assert.equal(BUSINESS_TYPES[0].id, 'all');

  const point = boundsSearchPoint([48.85, 2.34, 48.86, 2.36]);
  assert.ok(point.radius >= 1 && point.radius <= 50);
  assert.equal(point.coversBounds, true);
  assert.throws(() => boundsSearchPoint([1, 2, 0, 3]), /bounds are invalid/);
  assert.equal(boundsSearchPoint([40, -10, 50, 10]).coversBounds, false);

  const originalFetch = globalThis.fetch;
  let requestUrl;
  globalThis.fetch = async (url) => {
    requestUrl = new URL(url);
    const clothingSearch = requestUrl.searchParams.get('activite_principale') === '47.71Z,47.72A,47.72B';
    return new Response(JSON.stringify({
      page: 2,
      total_pages: 4,
      total_results: 100,
      results: [
        {
          nom_complet: clothingSearch ? 'Clothing shop' : 'Boulangerie Test',
          activite_principale: clothingSearch ? '47.71Z' : '47.24Z',
          matching_etablissements: [
            {
              siret: '12345678900011',
              etat_administratif: 'A',
              latitude: '48.855',
              longitude: '2.35',
              activite_principale: clothingSearch ? '47.71Z' : '47.24Z',
              adresse: '1 Rue Test, 75001 Paris',
              code_postal: '75001',
              libelle_commune: 'PARIS',
            },
            {
              siret: '12345678900012',
              etat_administratif: 'F',
              latitude: '48.855',
              longitude: '2.35',
            },
            {
              siret: '12345678900013',
              etat_administratif: 'A',
              latitude: '49.5',
              longitude: '2.35',
            },
          ],
        },
      ],
    }), { status: 200 });
  };
  try {
    const result = await searchNearbyBusinesses([48.85, 2.34, 48.86, 2.36], 2);
    assert.equal(requestUrl.pathname, '/near_point');
    assert.equal(requestUrl.searchParams.get('section_activite_principale'), 'G,I');
    assert.equal(requestUrl.searchParams.get('page'), '2');
    assert.equal(result.page, 2);
    assert.equal(result.totalPages, 4);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].name, 'Boulangerie Test');
    assert.equal(result.items[0].postcode, '75001');
    const clothingResult = await searchNearbyBusinesses([48.85, 2.34, 48.86, 2.36], 1, undefined, 'clothing');
    assert.equal(requestUrl.searchParams.get('activite_principale'), '47.71Z,47.72A,47.72B');
    assert.equal(requestUrl.searchParams.has('section_activite_principale'), false);
    assert.equal(clothingResult.items.length, 1);
    assert.equal(clothingResult.items[0].name, 'Clothing shop');
    await assert.rejects(searchNearbyBusinesses([48.85, 2.34, 48.86, 2.36], 1, undefined, 'unknown'), /Unknown business type/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await test('Paris Open Data: geographic search, normalization, SIRET dedupe and source attribution', async () => {
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    const requestUrl = new URL(url);
    urls.push(requestUrl);
    assert.equal(requestUrl.pathname, '/api/explore/v2.1/catalog/datasets/terrasses-autorisations/records');
    assert.match(requestUrl.searchParams.get('where'), /^within_distance\(geo_point_2d,geom'POINT\(/);
    assert.match(requestUrl.searchParams.get('select'), /siret/);
    return new Response(JSON.stringify({
      total_count: 2,
      results: [
        {
          nom_enseigne: 'Café Test',
          nom_societe: 'Test SARL',
          siret: '12345678900011',
          adresse: '10 Rue Test',
          arrondissement: '75011',
          typologie: 'TERRASSE OUVERTE',
          geo_point_2d: { lat: 48.855, lon: 2.35 },
        },
        {
          nom_enseigne: 'Outside',
          siret: '12345678900012',
          adresse: 'Outside Paris',
          arrondissement: '75011',
          typologie: 'TERRASSE OUVERTE',
          geo_point_2d: { lat: 48.9, lon: 2.35 },
        },
      ],
    }), { status: 200 });
  };
  try {
    const [result] = await searchParisOpenData(
      [48.85, 2.34, 48.86, 2.36],
      ['terraces'],
      'all'
    );
    assert.equal(urls.length, 1);
    assert.equal(result.totalCount, 2);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].key, 'company/12345678900011');
    assert.equal(result.items[0].source, 'Ville de Paris Open Data · terrace authorization');
    assert.equal(result.items[0].postcode, '75011');
    assert.equal(isParisSourceApplicable('waterPartners', 'restaurant'), false);
    assert.equal(isParisSourceApplicable('terraces', 'restaurant'), true);

    const sirene = {
      key: 'company/12345678900011',
      name: 'Cafe Test',
      fullAddress: '10 rue Test, 75011 Paris',
      source: 'API Recherche d’entreprises · SIRENE',
    };
    const merged = addBusinessesWithoutDuplicates(new Map([[sirene.key, sirene]]), result.items);
    assert.equal(merged.size, 1);
    assert.equal(merged.get(sirene.key).source, sirene.source);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await test('Paris Open Data: partner records normalize and source page cap is enforced', async () => {
  const originalFetch = globalThis.fetch;
  const offsets = [];
  globalThis.fetch = async (url) => {
    const requestUrl = new URL(url);
    offsets.push(Number(requestUrl.searchParams.get('offset')));
    assert.equal(requestUrl.pathname, '/api/explore/v2.1/catalog/datasets/commerces-eau-de-paris/records');
    return new Response(JSON.stringify({
      total_count: 501,
      results: Array.from({ length: 100 }, (_, index) => ({
        id: String(index + offsets.at(-1)),
        nom_commerce: `Partner ${index + offsets.at(-1)}`,
        num_voie: '12',
        nom_voie: 'Rue Example',
        code_postal: '75011',
        nom_commune: 'Paris',
        geo_point_2d: { lat: 48.855, lon: 2.35 },
      })),
    }), { status: 200 });
  };
  try {
    const [result] = await searchParisOpenData(
      [48.85, 2.34, 48.86, 2.36],
      ['waterPartners'],
      'all'
    );
    assert.deepEqual(offsets, [0, 100, 200, 300, 400]);
    assert.equal(result.items.length, 500);
    assert.equal(result.capped, true);
    assert.equal(result.items[0].fullAddress, '12 Rue Example, 75011, Paris');
    assert.equal(result.items[0].kind, 'Eau de Paris partner · category not specified');
    const nearSirene = {
      key: 'company/12345678900011',
      name: 'Partner 0',
      lat: 48.8551,
      lon: 2.3501,
      fullAddress: 'A different but nearby address',
    };
    assert.equal(addBusinessesWithoutDuplicates(new Map([[nearSirene.key, nearSirene]]), result.items).size, 500);
    const duplicateOnly = addBusinessesWithoutDuplicates(
      new Map([[nearSirene.key, nearSirene]]),
      [result.items[0]]
    );
    assert.equal(duplicateOnly.size, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
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
