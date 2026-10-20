export const BUSINESS_TYPES = [
  { id: 'all', label: 'All shops & food businesses', sections: ['G', 'I'] },
  { id: 'restaurant', label: 'Restaurants', activityCodes: ['56.10A', '56.10B', '56.10C'] },
  { id: 'clothing', label: 'Clothing & shoe shops', activityCodes: ['47.71Z', '47.72A', '47.72B'] },
  { id: 'bakery', label: 'Bakeries & pastry shops', activityCodes: ['47.24Z'] },
  { id: 'grocery', label: 'Groceries & supermarkets', activityCodes: ['47.11A', '47.11B', '47.11C', '47.11D', '47.11E', '47.11F'] },
  { id: 'pharmacy', label: 'Pharmacies', activityCodes: ['47.73Z'] },
  { id: 'cafe', label: 'Cafés & bars', activityCodes: ['56.30Z'] },
  { id: 'florist', label: 'Florists', activityCodes: ['47.76Z'] },
  { id: 'bookshop', label: 'Bookshops', activityCodes: ['47.61Z'] },
  { id: 'hairdresser', label: 'Hairdressers', activityCodes: ['96.02A'] },
];

export function getBusinessType(id) {
  return BUSINESS_TYPES.find((type) => type.id === id) ?? null;
}
