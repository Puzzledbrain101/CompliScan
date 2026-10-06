const test = require('node:test');
const assert = require('node:assert/strict');
const { extractFieldsFromText } = require('../ocr-processor');

test('extracts all fields from a simple labelled pack', () => {
  const { fields, confidences } = extractFieldsFromText([
    'Product: Herbal Face Cream',
    'MRP: Rs. 199',
    'Net Wt: 100 g',
    'Manufactured by: ABC Cosmetics Pvt Ltd, Mumbai',
    'Mfg Date: 05/2025',
    'Country of Origin: India',
    'Customer Care: 1800 123 4567'
  ].join('\n'));

  assert.deepEqual(fields, {
    product_name: 'Herbal Face Cream',
    MRP: '₹199',
    manufacturer: 'ABC Cosmetics Pvt Ltd, Mumbai',
    net_quantity: '100 g',
    country_of_origin: 'India',
    consumer_care: '1800 123 4567',
    date_of_manufacture: '05/2025'
  });
  assert.equal(confidences.MRP, 0.85);
});

test('handles a multi-line manufacturer address and packed-on date', () => {
  const { fields } = extractFieldsFromText([
    'BIKAJI BHUJIA',
    'Net Wt. 400g',
    'M.R.P. ₹ 120.00 (Incl. of all taxes)',
    'Mfd. by: Bikaji Foods International Ltd.,',
    'F 196-199, Bichhwal Industrial Area,',
    'Bikaner 334006, Rajasthan',
    'Pkd. On: 12/03/2025',
    'Best Before: 6 months from packaging',
    'Country of Origin: India',
    'For feedback contact: customercare@bikaji.com'
  ].join('\n'));

  assert.equal(fields.product_name, 'BIKAJI BHUJIA');
  assert.equal(fields.MRP, '₹120.00');
  assert.equal(fields.net_quantity, '400g');
  assert.equal(
    fields.manufacturer,
    'Bikaji Foods International Ltd., F 196-199, Bichhwal Industrial Area, Bikaner 334006, Rajasthan'
  );
  assert.equal(fields.date_of_manufacture, '12/03/2025');
  assert.equal(fields.country_of_origin, 'India');
  assert.equal(fields.consumer_care, 'customercare@bikaji.com');
});

test('manufacturer address stops at the next declaration', () => {
  const { fields } = extractFieldsFromText([
    'Manufactured by: ABC Cosmetics Pvt Ltd',
    'Mfg Date: 05/2025'
  ].join('\n'));
  assert.equal(fields.manufacturer, 'ABC Cosmetics Pvt Ltd');
});

test('country of origin does not run onto the next line', () => {
  const { fields } = extractFieldsFromText('Made in India\nCustomer Care: 1800 123 4567');
  assert.equal(fields.country_of_origin, 'India');
});

test('expiry and best-before dates are not treated as manufacture date', () => {
  const { fields } = extractFieldsFromText('EXP: 12/2026\nBest before 03/2026\nUse by MAR 2026');
  assert.equal(fields.date_of_manufacture, null);
});

test('recognises month-name manufacture dates', () => {
  const { fields } = extractFieldsFromText('MFD: MAY 2025');
  assert.equal(fields.date_of_manufacture, 'MAY 2025');
});

test('labelled MRP wins over other prices and strips thousands separators', () => {
  const { fields } = extractFieldsFromText('Offer price Rs. 999\nMRP Rs.1,299 incl. of all taxes');
  assert.equal(fields.MRP, '₹1299');
});

test('ignores consumer care numbers that are too short to be phone numbers', () => {
  const { fields } = extractFieldsFromText('Customer Care: 12345');
  assert.equal(fields.consumer_care, null);
});

test('returns nulls and zero confidence for empty text', () => {
  const { fields, confidences } = extractFieldsFromText('');
  for (const key of Object.keys(fields)) {
    assert.equal(fields[key], null, key);
    assert.equal(confidences[key], 0, key);
  }
});
