// CompliScan demo extension: read the active tab's HTML (activeTab, only when
// the popup is opened) and check it with the backend's /api/check-page.
import { API_BASE_URL, APP_URL } from './config.js';

// Mirrors frontend/src/lib/results.js (no build step here, so kept in sync by hand)
const REQUIRED_FIELDS = [
  { key: 'manufacturer', label: 'Manufacturer / packer / importer' },
  { key: 'net_quantity', label: 'Net quantity' },
  { key: 'MRP', label: 'Retail sale price (MRP)' },
  { key: 'consumer_care', label: 'Consumer care' },
  { key: 'date_of_manufacture', label: 'Month & year of manufacture' },
  { key: 'country_of_origin', label: 'Country of origin' }
];
const STATUS = {
  approved: { label: 'Compliant', tone: 'ok' },
  needs_review: { label: 'Needs review', tone: 'warn' },
  failed: { label: 'Non-compliant', tone: 'bad' }
};
const ICON = { ok: '✓', invalid: '!', missing: '×', unverifiable: '?' };

const view = document.getElementById('view');

// Build DOM without innerHTML so page-derived text can never inject markup
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'style') node.style.cssText = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child != null && child !== false) node.append(child);
  }
  return node;
}

function show(...nodes) {
  view.replaceChildren(...nodes);
}

function showLoading(text) {
  show(el('div', { class: 'loading', role: 'status' },
    el('span', { class: 'spinner', 'aria-hidden': 'true' }),
    el('div', {}, el('p', {}, text), el('p', { class: 'muted' }, 'This takes a second.'))));
}

function showError(title, text, { retry = true } = {}) {
  show(
    el('p', { class: 'error-title' }, title),
    el('p', { class: 'error-text' }, text),
    retry && el('div', { class: 'actions' }, el('button', { class: 'secondary', onclick: run }, 'Try again'))
  );
}

function fieldState(result, key) {
  if ((result.unverifiable_fields || []).some(u => u.field === key)) return 'unverifiable';
  const issue = (result.issues || []).find(i => i.field === key);
  if (issue?.type === 'missing') return 'missing';
  if (issue) return 'invalid';
  return result.parsed?.[key] ? 'ok' : 'missing';
}

function fieldText(result, key, state) {
  if (state === 'missing') return 'Not found on the page';
  if (state === 'unverifiable') return 'Check the physical pack';
  return String(result.parsed[key]);
}

function showResult(result) {
  const status = STATUS[result.status] || { label: 'Unknown', tone: 'neutral' };
  const score = Math.max(0, Math.min(100, result.compliance_score ?? 0));
  const states = REQUIRED_FIELDS.map(f => ({ ...f, state: fieldState(result, f.key) }));
  const checkable = states.filter(f => f.state !== 'unverifiable');
  const found = checkable.filter(f => f.state === 'ok').length;
  const toVerify = states.length - checkable.length;

  show(el('div', { class: `tone-${status.tone}` },
    el('div', { class: 'head' },
      el('div', {},
        el('span', { class: 'badge' }, status.label),
        el('p', { class: 'name', title: result.parsed?.product_name || '' }, result.parsed?.product_name || 'Unnamed product')),
      el('p', { class: 'score' }, String(score), el('small', {}, '/100'))),
    el('div', { class: 'meter', role: 'img', 'aria-label': `Score ${score} out of 100` },
      el('span', { style: `--value: ${score / 100}` })),
    el('p', { class: 'summary' }, `${found} of ${checkable.length} required declarations found${toVerify ? ` · ${toVerify} to verify on the pack` : ''}`),
    el('ul', { class: 'fields' }, states.map(f =>
      el('li', { class: `state-${f.state}` },
        el('span', { class: 'dot', 'aria-hidden': 'true' }, ICON[f.state]),
        el('span', { class: 'field-label' }, f.label),
        el('span', { class: 'field-value', title: fieldText(result, f.key, f.state) }, fieldText(result, f.key, f.state))))),
    el('div', { class: 'actions' },
      el('button', {
        class: 'primary',
        onclick: () => chrome.tabs.create({ url: `${APP_URL}/?check=${encodeURIComponent(result.id)}` })
      }, 'Open full result'))
  ));
}

async function run() {
  showLoading('Checking this page…');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:\/\//.test(tab.url || '')) {
    showError('Open a product page first', 'Go to a product page on any online store, then click the CompliScan icon.', { retry: false });
    return;
  }

  let page;
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({ url: location.href, html: document.documentElement.outerHTML })
    });
    page = injection.result;
  } catch {
    showError('Can’t read this page', 'Chrome doesn’t let extensions read this kind of page. Try a regular store page.', { retry: false });
    return;
  }

  let response;
  let body;
  try {
    response = await fetch(`${API_BASE_URL}/api/check-page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(page)
    });
    body = await response.json().catch(() => ({}));
  } catch {
    showError('Can’t reach CompliScan', `Is the backend running at ${API_BASE_URL}? Start it, or update extension/config.js.`);
    return;
  }

  if (!response.ok) {
    showError('The check didn’t finish', body.error || `The server returned ${response.status}.`);
    return;
  }
  showResult(body);
}

run();
