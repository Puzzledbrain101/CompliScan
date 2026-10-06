// Where the extension sends pages and opens full results.
// Defaults match local development (`npm start` in backend/, `npm run dev -- --port 5173` in frontend/).
// For a deployed demo, change both and make sure API_BASE_URL is covered by
// "host_permissions" in manifest.json, then reload the extension.
export const API_BASE_URL = 'http://localhost:8000';
export const APP_URL = 'http://localhost:5173';
