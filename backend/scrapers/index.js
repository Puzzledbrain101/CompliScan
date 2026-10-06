// scrapers/index.js - fetch a product page and extract Legal Metrology
// declarations from every layer the page offers, without per-site code:
//   1. embedded app state (JSON the storefront renders from)
//   2. spec rows inside that state ({ label, value } lists)
//   3. visible page text (spec tables, label/value pairs)
//   4. schema.org JSON-LD (name, price, size, origin; never brand-as-manufacturer)
const cheerio = require('cheerio');
const { fetchPage } = require('./fetch-page');
const { extractJsonLd } = require('./json-ld');
const { extractAppState } = require('./app-state');
const { extractVisibleText, extractFromLines } = require('./visible-text');

const DECLARED = 0.85; // value sits next to its label / under its field name
const LISTED = 0.7;    // structured data that may not be the declared value
const GUESSED = 0.55;  // page title / heading fallbacks

const FIELDS = ['MRP', 'net_quantity', 'manufacturer', 'country_of_origin', 'consumer_care', 'date_of_manufacture'];

function cleanTitle(title) {
  if (!title) return null;
  const text = title.replace(/\s+/g, ' ').trim()
    .replace(/^buy\s+/i, '')
    .replace(/\s+(online|at best price).*$/i, '')
    .replace(/\s+[|–]\s+[^|–]*$/, '');
  return text || null;
}

function extractProductFields(html, pageUrl) {
  const $ = cheerio.load(html);
  const jsonLd = extractJsonLd($);
  const state = extractAppState($, pageUrl);
  const specs = extractFromLines(state.specLines);
  const headingText = $('h1').first().text();
  const ogTitle = $('meta[property="og:title"]').attr('content');
  const visible = extractVisibleText(cheerio.load(html));

  const fields = {};
  const confidences = {};
  const sources = {};
  const take = (field, value, confidence, source) => {
    if (fields[field] || !value) return;
    fields[field] = String(value).trim();
    confidences[field] = confidence;
    sources[field] = source;
  };

  for (const field of FIELDS) {
    take(field, state.fields[field], DECLARED, 'page data');
    take(field, specs[field], DECLARED, 'page data');
    take(field, visible[field], DECLARED, 'page text');
  }
  // Structured data last: offers.price is often the selling price, not MRP
  take('MRP', jsonLd.price && `₹${String(jsonLd.price).replace(/[^\d.]/g, '')}`, LISTED, 'structured data');
  take('net_quantity', jsonLd.net_quantity, LISTED, 'structured data');
  take('country_of_origin', jsonLd.country_of_origin, LISTED, 'structured data');

  take('product_name', jsonLd.product_name, DECLARED, 'structured data');
  take('product_name', cleanTitle(ogTitle), GUESSED, 'page title');
  take('product_name', headingText && headingText.replace(/\s+/g, ' ').trim().slice(0, 200), GUESSED, 'page heading');

  return {
    product_name: fields.product_name || null,
    MRP: fields.MRP || null,
    net_quantity: fields.net_quantity || null,
    manufacturer: fields.manufacturer || null,
    country_of_origin: fields.country_of_origin || null,
    consumer_care: fields.consumer_care || null,
    date_of_manufacture: fields.date_of_manufacture || null,
    brand: jsonLd.brand || null,
    _field_confidences: confidences,
    _field_sources: sources
  };
}

async function scrapeProduct(url) {
  const { html, finalUrl } = await fetchPage(url);
  return extractProductFields(html, finalUrl);
}

module.exports = { scrapeProduct, extractProductFields };
