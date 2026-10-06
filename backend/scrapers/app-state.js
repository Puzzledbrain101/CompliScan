// app-state.js - read declarations from the JSON that modern storefronts embed
// in the page (Next.js __NEXT_DATA__, window.__PRELOADED_STATE__ and similar).
// Field names are matched generically, so no per-site code is needed.
const { DECLARATION_LABEL } = require('./labels');

const MAX_BLOB_CHARS = 8 * 1024 * 1024;
const MAX_NODES = 300000;
const MAX_SPEC_LINES = 2000;

// Normalised key (lowercase, alphanumerics only) -> field
const FIELD_KEYS = {
  country_of_origin: ['countryoforigin', 'countryoforiginname', 'origincountry', 'countryorigin', 'originofcountry', 'originofcountryname', 'madein', 'coo'],
  MRP: ['mrp', 'maxretailprice', 'maximumretailprice', 'mrpprice', 'mrpvalue'],
  net_quantity: ['netquantity', 'netqty', 'netweight', 'netwt', 'netcontent', 'netcontents', 'netvolume', 'packsize'],
  consumer_care: ['customercare', 'consumercare', 'customercaredetails', 'consumercaredetails', 'customercareaddress', 'customercarenumber', 'customercareemail', 'customersupportemail', 'helpline'],
  date_of_manufacture: ['mfgdate', 'manufacturingdate', 'dateofmanufacture', 'manufacturedate', 'manufacturedon', 'packeddate', 'packagingdate', 'dateofmfg', 'mfddate']
};

// Name and address of manufacturer / packer / importer / marketer, in priority order
const PARTY_KEYS = [
  { names: ['manufacturer', 'manufacturername', 'manufacturedby', 'mfgby', 'manufacturerdetails'], addresses: ['manufactureraddress'] },
  { names: ['packer', 'packername', 'packedby', 'packerdetails'], addresses: ['packeraddress'] },
  { names: ['importer', 'importername', 'importedby', 'importerdetails'], addresses: ['importeraddress'] },
  { names: ['marketer', 'marketername', 'marketedby', 'marketerdetails'], addresses: ['marketeraddress'] }
];

const LABEL_KEYS = ['label', 'key', 'name', 'title', 'attributename', 'displayname', 'heading'];
const VALUE_KEYS = ['value', 'values', 'displayvalue', 'text', 'attributevalue', 'description'];

const normaliseKey = (key) => String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
const PLACEHOLDER = /^(na|n\/a|nil|none|null|undefined|-|--|not available|not applicable)$/i;

function cleanValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const text = value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text || text.length > 500 || PLACEHOLDER.test(text)) return null;
  return text;
}

// A field value must not itself be a UI label ("countryOfOrigin": "Country of Origin")
const declaredValue = (value) => {
  const text = cleanValue(value);
  return text && !DECLARATION_LABEL.test(text) ? text : null;
};

// Short text carried by a widget: "x", ["x", "y"], { text }, { value: { text } }
function widgetText(value, depth = 0) {
  if (typeof value === 'string') return cleanValue(value);
  if (Array.isArray(value)) {
    if (!value.length || value.length > 5 || !value.every(v => typeof v === 'string')) return null;
    return cleanValue(value.join(', '));
  }
  if (value && typeof value === 'object' && depth < 2) {
    return widgetText(value.text, depth + 1) || widgetText(value.value, depth + 1);
  }
  return null;
}

// Read the JSON object literal that starts at `start`, honouring strings
function readBalancedObject(source, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length && i - start < MAX_BLOB_CHARS; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  return null;
}

function tryParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Every JSON blob embedded in the page
function findStateBlobs($) {
  const blobs = [];
  $('script').each((_, el) => {
    const type = ($(el).attr('type') || '').toLowerCase();
    if (type === 'application/ld+json') return; // handled by json-ld.js
    const text = $(el).contents().text();
    if (text.length < 50) return;

    if (type === 'application/json') {
      const parsed = tryParse(text.trim());
      if (parsed && typeof parsed === 'object') blobs.push(parsed);
      return;
    }

    // window.__STATE__ = {...}  /  self.__DATA__ = {...}
    const assignment = /(?:window|self|globalThis)\s*\.\s*[\w$]+\s*=\s*\{/g;
    let match;
    while ((match = assignment.exec(text)) !== null) {
      const literal = readBalancedObject(text, match.index + match[0].length - 1);
      const parsed = literal && tryParse(literal);
      if (parsed) blobs.push(parsed);
    }
  });
  return blobs;
}

// Values in the link (query params, numeric path segments) identify the
// variant the user picked, e.g. Nykaa's ?skuId= matches a variant's childId
function urlHints(pageUrl) {
  const hints = new Set();
  try {
    const url = new URL(pageUrl);
    for (const value of url.searchParams.values()) if (value.length >= 3) hints.add(value);
    for (const segment of url.pathname.split('/')) if (/^\d{4,}$/.test(segment)) hints.add(segment);
  } catch {
    // ignore malformed URLs
  }
  return hints;
}

function walk(blobs, hints) {
  const candidates = []; // { field, value, preferred, order }
  const specLines = [];
  let order = 0;
  let nodes = 0;

  const stack = blobs.map(blob => ({ node: blob, preferred: false }));
  while (stack.length && nodes < MAX_NODES) {
    const { node, preferred: inherited } = stack.pop();
    nodes++;
    if (!node || typeof node !== 'object') continue;

    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) {
        const item = node[i];
        const matchesHint = item && typeof item === 'object' && !Array.isArray(item) &&
          Object.values(item).some(v => (typeof v === 'string' || typeof v === 'number') && hints.has(String(v)));
        stack.push({ node: item, preferred: inherited || matchesHint });
      }
      continue;
    }

    const entries = Object.entries(node);
    const byKey = new Map(entries.map(([k, v]) => [normaliseKey(k), v]));

    // { label: "Country of Origin", value: "India" } style spec rows
    const labelKey = LABEL_KEYS.find(k => typeof byKey.get(k) === 'string');
    const valueKey = VALUE_KEYS.find(k => k !== labelKey && byKey.has(k));
    if (labelKey && valueKey && specLines.length < MAX_SPEC_LINES) {
      const raw = byKey.get(valueKey);
      const value = Array.isArray(raw) ? raw.map(cleanValue).filter(Boolean).join(', ') : cleanValue(raw);
      const label = cleanValue(byKey.get(labelKey));
      if (label && value && label.length <= 60) specLines.push(`${label}: ${value}`);
    }

    // Sibling widgets where one names a declaration and another holds its
    // value, e.g. { label_0: { value: { text: "Country of Origin" } }, label_1: { value: { text: ["India"] } } }
    if (entries.length <= 12 && specLines.length < MAX_SPEC_LINES) {
      const texts = entries.map(([, v]) => widgetText(v)).filter(Boolean);
      const label = texts.find(t => DECLARATION_LABEL.test(t));
      const values = texts.filter(t => !DECLARATION_LABEL.test(t));
      if (label && values.length && values.length <= 3) specLines.push(`${label.replace(/[:\-]\s*$/, '')}: ${values.join(', ')}`);
    }

    for (const [field, keys] of Object.entries(FIELD_KEYS)) {
      for (const key of keys) {
        const value = declaredValue(byKey.get(key));
        if (value) candidates.push({ field, value, preferred: inherited, order: order++ });
      }
    }

    for (const { names, addresses } of PARTY_KEYS) {
      for (const key of names) {
        let raw = byKey.get(key);
        let name = declaredValue(raw);
        let address = addresses.map(a => cleanValue(byKey.get(a))).find(Boolean) || null;
        if (!name && raw && typeof raw === 'object' && !Array.isArray(raw)) {
          name = declaredValue(raw.name);
          address = address || cleanValue(raw.address);
        }
        if (name) {
          const value = address && !name.includes(address) ? `${name}, ${address}` : name;
          candidates.push({ field: 'manufacturer', value, preferred: inherited, order: order++, rank: PARTY_KEYS.findIndex(p => p.names === names) });
        }
      }
    }

    for (let i = entries.length - 1; i >= 0; i--) {
      const child = entries[i][1];
      if (child && typeof child === 'object') stack.push({ node: child, preferred: inherited });
    }
  }
  return { candidates, specLines };
}

function best(candidates, field) {
  return candidates
    .filter(c => c.field === field)
    .sort((a, b) =>
      (b.preferred - a.preferred) ||
      ((a.rank ?? 0) - (b.rank ?? 0)) ||
      (a.order - b.order))[0]?.value ?? null;
}

function formatMrp(value) {
  if (!value) return null;
  const amount = String(value).replace(/[^\d.]/g, '');
  return amount ? `₹${amount}` : null;
}

// Returns { fields: { MRP, net_quantity, manufacturer, country_of_origin,
// consumer_care, date_of_manufacture }, specLines: ["Label: value", ...] }
function extractAppState($, pageUrl) {
  const blobs = findStateBlobs($);
  if (!blobs.length) return { fields: {}, specLines: [] };
  const { candidates, specLines } = walk(blobs, urlHints(pageUrl));
  return {
    fields: {
      MRP: formatMrp(best(candidates, 'MRP')),
      net_quantity: best(candidates, 'net_quantity'),
      manufacturer: best(candidates, 'manufacturer'),
      country_of_origin: best(candidates, 'country_of_origin'),
      consumer_care: best(candidates, 'consumer_care'),
      date_of_manufacture: best(candidates, 'date_of_manufacture')
    },
    specLines
  };
}

module.exports = { extractAppState };
