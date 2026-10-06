const test = require('node:test');
const assert = require('node:assert/strict');
const { extractProductFields } = require('../scrapers');
const { describeFetchError, looksLikeBotWall } = require('../scrapers/fetch-page');

const page = (head, body) => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const jsonLd = (data) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;

// Storefront that renders from window.__PRELOADED_STATE__ with per-variant declarations
const variantDeclarations = (country, mrp, size) => ({
  mrp,
  packSize: size,
  manufacture: [{
    manufacturerName: 'Acme Cosmetics Inc',
    manufacturerAddress: '12 Harbour Road, Ningbo',
    importerName: 'Acme India Pvt Ltd',
    importerAddress: 'Chakan, Pune 410501',
    originOfCountryName: country,
    manufacturerNameLabel: 'Manufacturer: ',
    countryOfOriginLabel: 'Country of Origin: '
  }]
});
const stateStore = page(
  `<title>Buy Acme Lip Gloss Online</title>${jsonLd({ '@context': 'https://schema.org', '@type': 'Product', name: 'Acme Lip Gloss', brand: { '@type': 'Brand', name: 'Acme' }, offers: { '@type': 'Offer', price: 450 } })}`,
  `<h1>Acme Lip Gloss</h1><script>window.__PRELOADED_STATE__ = ${JSON.stringify({
    productPage: {
      product: {
        id: '555001',
        name: 'Acme Lip Gloss',
        mrp: 999,
        manufacture: variantDeclarations('China', 999, null).manufacture,
        variants: [
          { childId: 900001, name: 'Acme Lip Gloss - Rose', ...variantDeclarations('China', 999, '5ml') },
          { childId: 900002, name: 'Acme Lip Gloss - Jumbo', ...variantDeclarations('Korea', 1499, '12ml') }
        ]
      }
    }
  })};</script>`
);

test('reads declarations from embedded app state without site-specific code', () => {
  const r = extractProductFields(stateStore, 'https://shop.example/acme-lip-gloss/p/555001');
  assert.equal(r.MRP, '₹999');
  assert.equal(r.manufacturer, 'Acme Cosmetics Inc, 12 Harbour Road, Ningbo');
  assert.equal(r.country_of_origin, 'China');
  assert.equal(r.product_name, 'Acme Lip Gloss');
  assert.equal(r._field_sources.manufacturer, 'page data');
});

test('prefers the variant named in the link', () => {
  const r = extractProductFields(stateStore, 'https://shop.example/acme-lip-gloss/p/555001?skuId=900002');
  assert.equal(r.MRP, '₹1499');
  assert.equal(r.net_quantity, '12ml');
  assert.equal(r.country_of_origin, 'Korea');
});

test('never uses the brand as the manufacturer', () => {
  const html = page(jsonLd({ '@type': 'Product', name: 'Plain Tea', brand: 'TeaCo', offers: { price: '120' } }), '<h1>Plain Tea</h1>');
  const r = extractProductFields(html, 'https://shop.example/tea');
  assert.equal(r.manufacturer, null);
  assert.equal(r.brand, 'TeaCo');
});

test('reads { label, value } spec lists from __NEXT_DATA__', () => {
  const nextData = {
    props: {
      pageProps: {
        product: {
          title: 'Basmati Rice 1kg',
          specifications: [
            { label: 'Net Quantity', value: '1 kg' },
            { label: 'Country of Origin', value: 'India' },
            { label: 'Manufactured By', value: 'Golden Grains Pvt Ltd, Karnal 132001' },
            { label: 'Customer Care', value: 'care@goldengrains.in' },
            { label: 'MRP', value: '₹ 245.00' }
          ]
        }
      }
    }
  };
  const html = page('', `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>`);
  const r = extractProductFields(html, 'https://grocer.example/p/basmati');
  assert.equal(r.net_quantity, '1 kg');
  assert.equal(r.country_of_origin, 'India');
  assert.equal(r.manufacturer, 'Golden Grains Pvt Ltd, Karnal 132001');
  assert.equal(r.consumer_care, 'care@goldengrains.in');
  assert.equal(r.MRP, '₹245.00');
});

test('reads spec tables and split label/value elements from visible text', () => {
  const html = page(
    jsonLd({ '@type': 'Product', name: 'Masala Chips', offers: { price: 18 } }),
    `<h1>Masala Chips</h1>
     <p>Offer price ₹18. Customers say: "only 50 g in the pack, wanted more"</p>
     <table class="specs">
       <tr><th>Net Quantity</th><td>52 g</td></tr>
       <tr><th>Maximum Retail Price</th><td>₹ 20 (incl. of all taxes)</td></tr>
       <tr><th>Manufactured By</th><td>Crunchy Foods Pvt Ltd, Pune</td></tr>
     </table>
     <div class="row"><div class="k">Country of Origin</div><div class="v">India</div></div>
     <dl><dt>Customer Care Details</dt><dd>1800 123 4567</dd></dl>`
  );
  const r = extractProductFields(html, 'https://snacks.example/chips');
  assert.equal(r.net_quantity, '52 g');
  assert.equal(r.MRP, '₹20');
  assert.equal(r.manufacturer, 'Crunchy Foods Pvt Ltd, Pune');
  assert.equal(r.country_of_origin, 'India');
  assert.equal(r.consumer_care, '1800 123 4567');
});

test('ignores unlabelled prices and quantities in page text', () => {
  const html = page('', '<h1>Gift Box</h1><p>Save ₹200 today! Weighs about 500 g.</p>');
  const r = extractProductFields(html, 'https://shop.example/gift');
  assert.equal(r.MRP, null);
  assert.equal(r.net_quantity, null);
});

test('falls back to JSON-LD price only when no MRP is declared, with lower confidence', () => {
  const html = page(jsonLd({ '@graph': [{ '@type': 'WebPage' }, { '@type': 'Product', name: 'Soap', offers: [{ price: '45.00' }], weight: { value: 100, unitText: 'g' } }] }), '');
  const r = extractProductFields(html, 'https://shop.example/soap');
  assert.equal(r.product_name, 'Soap');
  assert.equal(r.MRP, '₹45.00');
  assert.equal(r.net_quantity, '100 g');
  assert.ok(r._field_confidences.MRP < 0.85);
});

test('explains fetch failures in plain language', () => {
  const blocked = describeFetchError({ message: 'Request failed', response: { status: 403 } }, 'https://www.amazon.in/dp/X');
  assert.match(blocked.message, /amazon\.in blocked automated access/);
  assert.equal(blocked.expose, true);

  assert.match(describeFetchError({ message: 'x', response: { status: 404 } }, 'https://shop.example/a').message, /doesn't exist \(404\)/);
  assert.match(describeFetchError({ message: 'timeout of 15000ms exceeded', code: 'ECONNABORTED' }, 'https://shop.example/a').message, /took too long/);
  assert.match(describeFetchError({ message: 'getaddrinfo ENOTFOUND', code: 'ENOTFOUND' }, 'https://nope.example/a').message, /Couldn't find nope\.example/);
  assert.match(describeFetchError({ message: 'Parse Error: Header overflow', code: 'HPE_HEADER_OVERFLOW' }, 'https://shop.example/a').message, /couldn't read/);
  assert.equal(describeFetchError(new Error('URL validation failed: Access to private IP ranges is not allowed'), 'http://10.0.0.1').status, 400);
});

test('detects bot-check pages served with a 200 status', () => {
  assert.equal(looksLikeBotWall('<html><head><title>Amazon.in: Robot Check</title></head></html>'), true);
  assert.equal(looksLikeBotWall('<html><head><title>Just a moment...</title></head></html>'), true);
  assert.equal(looksLikeBotWall('<html><body>Enter the characters you see below</body></html>'), true);
  assert.equal(looksLikeBotWall(stateStore), false);
});

test('pairs sibling label/value widgets in app state', () => {
  const row = (label, value) => ({ col_0: {}, label_0: { value: { text: label } }, label_1: { value: { text: [value] } } });
  const state = {
    pageData: {
      widgets: [
        row('Net Quantity', '1 kg'),
        row('Country of Origin', 'India'),
        row('Name and address of the Packer', 'Bikaji Foods Ltd, Bichhwal Industrial Area, Bikaner 334006')
      ]
    }
  };
  const html = page('', `<script>window.__INITIAL_STATE__ = ${JSON.stringify(state)};</script>`);
  const r = extractProductFields(html, 'https://mart.example/p/namkeen');
  assert.equal(r.net_quantity, '1 kg');
  assert.equal(r.country_of_origin, 'India');
  assert.equal(r.manufacturer, 'Bikaji Foods Ltd, Bichhwal Industrial Area, Bikaner 334006');
});

test('does not take a UI label string as a declared value', () => {
  const state = {
    labels: { countryOfOrigin: 'Country of Origin', manufacturerInfo: 'Manufacturer Details' },
    product: { manufacturer: '', countryOfOrigin: 'India' }
  };
  const html = page('', `<script>window.__APP__ = ${JSON.stringify(state)};</script>`);
  const r = extractProductFields(html, 'https://fashion.example/p/1');
  assert.equal(r.country_of_origin, 'India');
  assert.equal(r.manufacturer, null);
});
