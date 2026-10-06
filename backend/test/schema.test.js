const test = require('node:test');
const assert = require('node:assert/strict');
const { createNormalizedLabel } = require('../schema');

const completeListing = {
  product_name: 'Bikaji Bhujia',
  MRP: '₹120',
  manufacturer: 'Bikaji Foods Ltd, Bikaner',
  net_quantity: '400 g',
  country_of_origin: 'India'
};

test('URL source: missing consumer care / date are unverifiable, not violations', () => {
  const label = createNormalizedLabel(completeListing, { source: 'url' });

  assert.deepEqual(label.violations, []);
  assert.deepEqual(label.unverifiable_fields.map(u => u.field), ['consumer_care', 'date_of_manufacture']);
  assert.equal(label.fields_total, 4);
  assert.equal(label.fields_present, 4);
  assert.notEqual(label.status, 'failed');
});

test('image source: missing consumer care / date are violations', () => {
  const label = createNormalizedLabel(completeListing, { source: 'image' });

  assert.deepEqual(
    label.violations.filter(v => v.type === 'missing').map(v => v.field),
    ['consumer_care', 'date_of_manufacture']
  );
  assert.deepEqual(label.unverifiable_fields, []);
  assert.equal(label.fields_total, 6);
});

test('all six fields present with high confidence is approved', () => {
  const fields = { ...completeListing, consumer_care: '1800 123 4567', date_of_manufacture: '05/2025' };
  const fieldConfidences = Object.fromEntries(Object.keys(fields).map(k => [k, 0.85]));
  const label = createNormalizedLabel(fields, { source: 'image', fieldConfidences });

  assert.deepEqual(label.violations, []);
  assert.equal(label.status, 'approved');
  assert.equal(label.compliance_score, 100);
});

test('accepts common manufacture date formats', () => {
  for (const date of ['12/03/2025', '05/2025', '05-25', 'MAY 2025', 'May-2025', "Mar'25"]) {
    const label = createNormalizedLabel({ date_of_manufacture: date }, { source: 'image' });
    assert.equal(label.violations.some(v => v.field === 'date_of_manufacture'), false, date);
  }
});

test('empty input fails with a zero score', () => {
  const label = createNormalizedLabel({}, { source: 'image' });
  assert.equal(label.status, 'failed');
  assert.equal(label.compliance_score, 0);
});

test('country of origin prefixes and trailing punctuation are stripped', () => {
  const label = createNormalizedLabel({ country_of_origin: 'Made in India.' }, { source: 'url' });
  assert.equal(label.country_of_origin, 'India');
  assert.equal(label.violations.some(v => v.field === 'country_of_origin'), false);
});

test('placeholder values count as missing', () => {
  const label = createNormalizedLabel({ manufacturer: 'Not Available' }, { source: 'url' });
  assert.equal(label.manufacturer, null);
  assert.ok(label.violations.some(v => v.field === 'manufacturer' && v.type === 'missing'));
});
