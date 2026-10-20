// Île-de-France departments (approximate bounding boxes, same as the original Field Finder app).
// Each entry: [south, west, north, east]
export const DEPARTMENTS = [
  { code: '77', name: 'Seine-et-Marne', bounds: [48.12, 2.39, 49.12, 3.56] },
  { code: '78', name: 'Yvelines', bounds: [48.438, 1.446, 49.1, 2.23] },
  { code: '91', name: 'Essonne', bounds: [48.285, 1.91, 48.777, 2.59] },
  { code: '92', name: 'Hauts-de-Seine', bounds: [48.728, 2.179, 48.95, 2.337] },
  { code: '93', name: 'Seine-Saint-Denis', bounds: [48.807, 2.29, 48.972, 2.603] },
  { code: '94', name: 'Val-de-Marne', bounds: [48.687, 2.316, 48.861, 2.575] },
  { code: '95', name: "Val-d'Oise", bounds: [48.91, 1.61, 49.24, 2.59] },
];

export const PARIS_BOUNDS = [48.815, 2.224, 48.902, 2.469];
export const IDF_BOUNDS = [48.1, 1.45, 49.24, 3.56];
export const ALL_DEPARTMENT_CODES = ['75', '77', '78', '91', '92', '93', '94', '95'];

export function getDepartment(code) {
  return DEPARTMENTS.find((d) => d.code === code) ?? null;
}

/** Department code(s) for the company-register API, given the selected area and the map centre. */
export function registryDepartments(area, [lat, lon]) {
  if (area === 'paris' || area.startsWith('arr-')) return '75';
  if (area.startsWith('dep-')) return area.slice(4);
  const boxes = [{ code: '75', bounds: PARIS_BOUNDS }, ...DEPARTMENTS];
  const hit = boxes.find(({ bounds: [s, w, n, e] }) => lat >= s && lat <= n && lon >= w && lon <= e);
  return hit ? hit.code : ALL_DEPARTMENT_CODES.join(',');
}
