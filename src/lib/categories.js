// Business categories: aliases (English + French, accent-free) -> OSM tag filters.
const CATEGORIES = [
  { label: 'Bakery', aliases: ['bakery', 'boulangerie', 'boulanger', 'bread', 'pain'], filters: [['shop', 'bakery']] },
  { label: 'Pastry shop', aliases: ['pastry', 'patisserie', 'cake'], filters: [['shop', 'pastry']] },
  { label: 'Pharmacy', aliases: ['pharmacy', 'pharmacie', 'chemist', 'drugstore'], filters: [['amenity', 'pharmacy']] },
  { label: 'Café', aliases: ['cafe', 'coffee', 'coffee shop'], filters: [['amenity', 'cafe']] },
  { label: 'Restaurant', aliases: ['restaurant', 'resto', 'food'], filters: [['amenity', 'restaurant']] },
  { label: 'Bar / Pub', aliases: ['bar', 'pub', 'drinks'], filters: [['amenity', 'bar'], ['amenity', 'pub']] },
  { label: 'Fast food', aliases: ['fast food', 'fastfood', 'burger'], filters: [['amenity', 'fast_food']] },
  { label: 'Ice cream', aliases: ['ice cream', 'glacier', 'glace'], filters: [['amenity', 'ice_cream']] },
  { label: 'Supermarket', aliases: ['supermarket', 'supermarche', 'grocery store'], filters: [['shop', 'supermarket']] },
  { label: 'Grocery', aliases: ['grocery', 'epicerie', 'convenience', 'greengrocer', 'primeur'], filters: [['shop', 'convenience'], ['shop', 'greengrocer']] },
  { label: 'Butcher', aliases: ['butcher', 'boucherie', 'boucher'], filters: [['shop', 'butcher']] },
  { label: 'Cheese shop', aliases: ['cheese', 'fromagerie', 'fromage'], filters: [['shop', 'cheese']] },
  { label: 'Wine shop', aliases: ['wine', 'caviste', 'cave', 'vin'], filters: [['shop', 'wine']] },
  { label: 'Florist', aliases: ['florist', 'fleuriste', 'flowers', 'fleurs'], filters: [['shop', 'florist']] },
  { label: 'Bookstore', aliases: ['bookstore', 'bookshop', 'books', 'librairie', 'livres'], filters: [['shop', 'books']] },
  { label: 'Clothing store', aliases: ['clothes', 'clothing', 'vetements', 'boutique', 'fashion'], filters: [['shop', 'clothes']] },
  { label: 'Hairdresser', aliases: ['hairdresser', 'hair salon', 'coiffeur', 'coiffure', 'barber'], filters: [['shop', 'hairdresser']] },
  { label: 'Laundry', aliases: ['laundry', 'laverie', 'pressing', 'dry cleaning'], filters: [['shop', 'laundry'], ['shop', 'dry_cleaning']] },
  { label: 'Bicycle shop', aliases: ['bicycle', 'bike', 'velo'], filters: [['shop', 'bicycle']] },
  { label: 'Tobacconist', aliases: ['tobacco', 'tabac'], filters: [['shop', 'tobacco']] },
  { label: 'Bank', aliases: ['bank', 'banque'], filters: [['amenity', 'bank']] },
  { label: 'Post office', aliases: ['post office', 'poste', 'la poste'], filters: [['amenity', 'post_office']] },
  { label: 'Doctor', aliases: ['doctor', 'doctors', 'medecin', 'generaliste'], filters: [['amenity', 'doctors']] },
  { label: 'Dentist', aliases: ['dentist', 'dentiste'], filters: [['amenity', 'dentist']] },
  { label: 'Hotel', aliases: ['hotel', 'hotels'], filters: [['tourism', 'hotel']] },
  { label: 'Gym', aliases: ['gym', 'fitness', 'sport', 'salle de sport'], filters: [['leisure', 'fitness_centre']] },
  { label: 'Cinema', aliases: ['cinema', 'movie', 'movies'], filters: [['amenity', 'cinema']] },
];

// Quick-pick chips shown under the search bar.
export const QUICK_PICKS = ['Bakery', 'Pharmacy', 'Café', 'Restaurant', 'Bar / Pub', 'Supermarket', 'Florist', 'Bookstore'].map(
  (label) => ({ label, query: CATEGORIES.find((c) => c.label === label).aliases[0] })
);

export function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Turn the text typed in the search bar into a search definition.
 * - known business type  -> { kind: 'category', label, filters, key }
 * - anything else        -> { kind: 'name', label, term, key } (search by business name)
 * - empty                -> null
 */
export function resolveQuery(text) {
  const q = normalize(text).slice(0, 40);
  if (!q) return null;

  let match = CATEGORIES.find((c) => c.aliases.includes(q));
  if (!match && q.length >= 3) {
    match = CATEGORIES.find((c) => c.aliases.some((a) => a.startsWith(q)));
  }
  if (match) {
    return {
      kind: 'category',
      label: match.label,
      filters: match.filters,
      key: 'cat:' + match.filters.map((f) => f.join('=')).join('|'),
    };
  }
  return { kind: 'name', label: `“${q}”`, term: q, key: 'name:' + q };
}
