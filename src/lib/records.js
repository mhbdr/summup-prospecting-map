// Visit records (payment method, visit status, notes), stored in this browser only.
// Same storage key and record shape as the original Field Finder app, so existing notes keep working.
import { formatAddress, prettyKind } from './format.js';
import { normalizeBusiness } from './sources.js';

export const STORAGE_KEY = 'field-finder.records.v1';

export const PAYMENT_OPTIONS = [
  { value: 'unknown', label: 'Not verified' },
  { value: 'cash', label: 'Cash only · verified' },
  { value: 'card', label: 'Card accepted · verified' },
  { value: 'both', label: 'Cash and card · verified' },
];

export const VISIT_OPTIONS = [
  { value: 'not-visited', label: 'Not visited' },
  { value: 'visited', label: 'Visited' },
  { value: 'interested', label: 'Interested' },
  { value: 'follow-up', label: 'Follow-up needed' },
  { value: 'not-interested', label: 'Not interested' },
];

export const DEFAULT_RECORD = { payment: 'unknown', visit: 'not-visited', notes: '' };

export function loadRecords() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function saveRecords(records) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

export const paymentLabel = (v) => PAYMENT_OPTIONS.find((o) => o.value === v)?.label ?? 'Not verified';
export const visitLabel = (v) => VISIT_OPTIONS.find((o) => o.value === v)?.label ?? 'Not visited';

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

/** Build the CSV text for all saved records. `currentItems` is a Map(key -> item) for fresher data. */
export function buildCsv(records, currentItems = new Map()) {
  const headers = [
    'Source', 'Record type', 'Record ID', 'Business', 'Business type', 'Latitude', 'Longitude',
    'Address', 'Phone', 'Website', 'Opening hours', 'Payment', 'Visit status', 'Notes', 'Updated',
  ];
  const rows = Object.entries(records).map(([key, record]) => {
    const [type, ...rest] = key.split('/');
    const business = currentItems.get(key) ?? normalizeBusiness(record.business);
    return [
      business?.source ?? '', type, rest.join('/'), business?.name ?? '', business ? prettyKind(business.kind) : '',
      business?.lat ?? '', business?.lon ?? '', business ? formatAddress(business) : '',
      business?.phone ?? '', business?.website ?? '', business?.hours ?? '',
      paymentLabel(record.payment), visitLabel(record.visit), record.notes ?? '', record.updatedAt ?? '',
    ];
  });
  if (!rows.length) return null;
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function downloadCsv(csv) {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `field-finder-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
