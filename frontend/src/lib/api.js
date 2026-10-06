// Backend URL - set VITE_API_BASE_URL to point at another backend
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'https://compliscan-backend.onrender.com';

async function request(path, options) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, options);
  } catch {
    throw new Error('Could not reach the CompliScan server. Check your connection and try again.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Too many checks in a short time. Wait a few minutes and try again.');
    }
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

export function runCheck(input) {
  // A page sent from the bookmarklet: the user's browser already fetched it
  if (input.kind === 'page') {
    return request('/api/check-page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: input.url, html: input.html })
    });
  }
  const form = new FormData();
  if (input.kind === 'image') form.append('image', input.file);
  else form.append('url', input.url);
  return request('/api/check', { method: 'POST', body: form });
}

export async function getHistory(limit = 50) {
  const data = await request(`/api/submissions?limit=${limit}`);
  return Array.isArray(data.submissions) ? data.submissions : [];
}

export async function getAnalytics() {
  const [trend, brands, stats] = await Promise.all([
    request('/api/analytics/trend'),
    request('/api/analytics/brands'),
    request('/api/analytics/stats')
  ]);
  return {
    trend: Array.isArray(trend) ? trend : [],
    brands: Array.isArray(brands) ? brands : [],
    stats: stats || null
  };
}
