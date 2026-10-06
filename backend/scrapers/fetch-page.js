// fetch-page.js - fetch a product page safely and explain failures in plain language
const http = require('http');
const https = require('https');
const axios = require('axios');
const { safeLookup, validateUrl } = require('../url-safety');

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 15000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
// Retailers behind CDNs (e.g. Nykaa via Akamai) send ~18 KB of cookies,
// over Node's 16 KB default; allow more for these outbound requests only
const MAX_RESPONSE_HEADER_BYTES = 64 * 1024;

// One consistent desktop Chrome identity; mismatched UA / client-hint pairs
// are a common bot signal
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-IN,en;q=0.9,hi;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1'
};

const transport = {
  request(options, callback) {
    const lib = options.protocol === 'https:' ? https : http;
    return lib.request({ ...options, maxHeaderSize: MAX_RESPONSE_HEADER_BYTES }, callback);
  }
};

// Error whose message is safe and useful to show to the user
class ScrapeError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.name = 'ScrapeError';
    this.status = status;
    this.expose = true;
  }
}

const PHOTO_HINT = 'Upload a photo of the label instead.';

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'The site';
  }
}

// Bot walls often answer 200 with a challenge page instead of the product
function looksLikeBotWall(html) {
  const head = html.slice(0, 20000);
  const title = (head.match(/<title[^>]*>([^<]*)/i) || [])[1] || '';
  return /robot check|captcha|are you a (human|robot)|access denied|attention required|verify you are human|just a moment/i.test(title) ||
    /Enter the characters you see below|cf-challenge|px-captcha|_Incapsula_Resource/i.test(head);
}

function describeFetchError(err, url) {
  const host = hostOf(url);
  if (err instanceof ScrapeError) return err;
  if (/URL validation failed/.test(err.message)) return new ScrapeError(err.message, 400);

  const status = err.response?.status;
  if (status === 401 || status === 403 || status === 429 || status === 503) {
    return new ScrapeError(`${host} blocked automated access to this page. ${PHOTO_HINT}`);
  }
  if (status === 404 || status === 410) {
    return new ScrapeError(`${host} says this page doesn't exist (${status}). Check the link.`);
  }
  if (status) {
    return new ScrapeError(`${host} returned an error (${status}). Try again later or ${PHOTO_HINT.toLowerCase()}`, 502);
  }
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || /timeout/i.test(err.message)) {
    return new ScrapeError(`${host} took too long to respond. Try again in a moment.`, 504);
  }
  if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
    return new ScrapeError(`Couldn't find ${host}. Check the link.`, 400);
  }
  if (err.code === 'ERR_FR_MAX_BODY_LENGTH_EXCEEDED' || /maxContentLength/i.test(err.message)) {
    return new ScrapeError(`That page from ${host} is too large to check.`);
  }
  if (err.code === 'HPE_HEADER_OVERFLOW' || /Parse Error/i.test(err.message)) {
    return new ScrapeError(`${host} sent a response we couldn't read. ${PHOTO_HINT}`, 502);
  }
  return new ScrapeError(`Couldn't load the page from ${host}. ${PHOTO_HINT}`, 502);
}

// Fetch HTML, following redirects manually so every hop is SSRF-checked
async function fetchPage(url) {
  let currentUrl = url;
  try {
    await validateUrl(currentUrl);
    for (let hop = 0; ; hop++) {
      const response = await axios.get(currentUrl, {
        timeout: TIMEOUT_MS,
        maxContentLength: MAX_BODY_BYTES,
        maxRedirects: 0,
        transport,
        lookup: safeLookup,
        headers: BROWSER_HEADERS,
        responseType: 'text',
        validateStatus: (status) => status >= 200 && status < 400
      });

      const location = response.headers.location;
      if (response.status >= 300 && location) {
        if (hop >= MAX_REDIRECTS) throw new ScrapeError(`${hostOf(url)} redirected too many times.`);
        currentUrl = new URL(location, currentUrl).toString();
        await validateUrl(currentUrl);
        continue;
      }

      const html = typeof response.data === 'string' ? response.data : String(response.data ?? '');
      if (looksLikeBotWall(html)) {
        throw new ScrapeError(`${hostOf(currentUrl)} showed a bot check instead of the product page. ${PHOTO_HINT}`);
      }
      return { html, finalUrl: currentUrl };
    }
  } catch (err) {
    throw describeFetchError(err, currentUrl);
  }
}

module.exports = { fetchPage, describeFetchError, looksLikeBotWall, ScrapeError };
