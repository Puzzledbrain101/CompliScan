// json-ld.js - schema.org Product data that most stores publish for search engines

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function typesOf(node) {
  return asArray(node?.['@type']).map(t => String(t).toLowerCase());
}

function textOf(value) {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim() || null;
  return textOf(value.name ?? value['@value'] ?? null);
}

// Collect every Product node, including ones nested in @graph or mainEntity
function findProducts(node, out = [], depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return out;
  if (Array.isArray(node)) {
    node.forEach(n => findProducts(n, out, depth + 1));
    return out;
  }
  if (typesOf(node).some(t => t === 'product' || t === 'productgroup')) out.push(node);
  for (const key of ['@graph', 'mainEntity', 'itemListElement', 'item', 'hasVariant']) {
    if (node[key]) findProducts(node[key], out, depth + 1);
  }
  return out;
}

function quantityOf(value) {
  if (value == null) return null;
  if (typeof value !== 'object') return textOf(value);
  const amount = value.value ?? value['@value'];
  const unit = value.unitText || value.unitCode;
  return amount != null ? [amount, unit].filter(Boolean).join(' ') : null;
}

// Returns { product_name, price, brand, net_quantity, country_of_origin } (nulls when absent)
function extractJsonLd($) {
  const products = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    try {
      findProducts(JSON.parse(raw), products);
    } catch {
      // Some sites ship invalid JSON-LD; skip it
    }
  });
  const product = products[0];
  if (!product) return {};

  const offer = asArray(product.offers).flatMap(o => [o, ...asArray(o?.offers)])
    .find(o => o && (o.price != null || o.lowPrice != null));

  return {
    product_name: textOf(product.name),
    price: offer ? textOf(offer.price ?? offer.lowPrice) : null,
    brand: textOf(product.brand),
    net_quantity: quantityOf(product.weight) || quantityOf(product.size) || null,
    country_of_origin: textOf(product.countryOfOrigin) || textOf(product.countryOfAssembly) || null
  };
}

module.exports = { extractJsonLd };
