// Declarations required by the Legal Metrology (Packaged Commodities) Rules, 2011
export const FIELDS = [
  { key: 'product_name', label: 'Product name', required: false },
  { key: 'manufacturer', label: 'Manufacturer / packer / importer', hint: 'Name and full address', required: true },
  { key: 'net_quantity', label: 'Net quantity', hint: 'In standard units: g, kg, ml, l or number', required: true },
  { key: 'MRP', label: 'Retail sale price (MRP)', hint: 'Inclusive of all taxes', required: true },
  { key: 'consumer_care', label: 'Consumer care', hint: 'Phone, email or address for complaints', required: true },
  { key: 'date_of_manufacture', label: 'Month & year of manufacture', hint: 'Or of packing / import', required: true },
  { key: 'country_of_origin', label: 'Country of origin', hint: 'Required for imported goods', required: true }
];

export const REQUIRED_FIELDS = FIELDS.filter(f => f.required);

export const STATUS = {
  approved: { label: 'Compliant', tone: 'ok' },
  needs_review: { label: 'Needs review', tone: 'warn' },
  failed: { label: 'Non-compliant', tone: 'bad' }
};

export function statusOf(status) {
  return STATUS[status] || { label: 'Unknown', tone: 'neutral' };
}

// Normalise a /api/check response into the same shape as a history entry
export function toEntry(result, input) {
  return {
    id: result.id,
    input_type: input.kind,
    input_source: input.kind === 'image' ? input.file.name : input.url,
    parsed: result.parsed || {},
    compliance_score: result.compliance_score ?? 0,
    status: result.status,
    issues: result.issues || [],
    unverifiable_fields: result.unverifiable_fields || [],
    reasons: result.reasons || [],
    timestamp: result.timestamp || new Date().toISOString()
  };
}

// Per-field state: ok | invalid | missing | unverifiable | absent (optional, not found)
export function fieldStates(entry) {
  const issues = entry.issues || [];
  const unverifiable = new Set((entry.unverifiable_fields || []).map(u => u.field));

  return FIELDS.map(field => {
    const value = entry.parsed?.[field.key] || null;
    const issue = issues.find(i => i.field === field.key);
    let state;
    if (unverifiable.has(field.key)) state = 'unverifiable';
    else if (issue?.type === 'missing') state = 'missing';
    else if (issue) state = 'invalid';
    else if (value) state = 'ok';
    else state = field.required ? 'missing' : 'absent';
    return { ...field, value, state };
  });
}

export function summarize(entry) {
  const states = fieldStates(entry).filter(f => f.required);
  const checkable = states.filter(f => f.state !== 'unverifiable');
  return {
    found: checkable.filter(f => f.state === 'ok').length,
    checkable: checkable.length,
    missing: states.filter(f => f.state === 'missing').length,
    invalid: states.filter(f => f.state === 'invalid').length,
    unverifiable: states.filter(f => f.state === 'unverifiable').length
  };
}

export function sourceLabel(entry) {
  if (entry.input_type === 'url' && entry.input_source) {
    try {
      return new URL(entry.input_source).hostname.replace(/^www\./, '');
    } catch {
      return entry.input_source;
    }
  }
  return entry.input_source || (entry.input_type === 'url' ? 'Product page' : 'Label photo');
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const absolute = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const full = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function formatWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return 'Just now';
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), 'hour');
  if (abs < 7 * 86400) return relative.format(Math.round(seconds / 86400), 'day');
  return absolute.format(date);
}

export function formatFull(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : full.format(date);
}
