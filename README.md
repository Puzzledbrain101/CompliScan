
# CompliScan

Checks packaged products against India's Legal Metrology (Packaged Commodities) Rules, 2011.
Upload a label photo or paste a product URL; CompliScan extracts the six mandatory declarations
(manufacturer, net quantity, MRP, consumer care, date of manufacture, country of origin), scores
compliance, and tracks results on a dashboard.

- **Frontend**: React + Vite + Recharts (`frontend/`)
- **Backend**: Express, Tesseract.js OCR (English + Hindi), Cheerio scraping, SQLite via built-in `node:sqlite` (`backend/`)

Requires Node.js 22.13 or newer.

## Run backend
```
cd backend
npm install
npm start
```

Runs on port 8000. The SQLite database is created at `backend/data/compliscan.db` on first start.

## Tests
```
cd backend
npm test
```

Uses the built-in Node test runner; covers OCR field extraction, compliance scoring, and SSRF URL checks. No network needed.

## Run frontend (dev)
```
cd frontend
npm install
npm run dev
```

Open http://localhost:5000.

## API
- `POST /api/check` - multipart `image` or JSON `{ "url": "..." }`; returns score, status, and violations
- `GET /api/submissions`, `GET /api/submissions/:id` - check history
- `GET /api/analytics/trend|brands|stats` - dashboard data
- `GET /health`

For URL checks, consumer care and date of manufacture are rarely shown on listings, so when missing
they are reported as "not verifiable" rather than counted as violations.

### How URL checks read a page

There is no per-site code. `backend/scrapers/` reads every layer a product page offers and keeps,
for each declaration, the most reliable value found:

1. **Embedded app data** - JSON the storefront renders from (`__NEXT_DATA__`, `window.__*_STATE__`, JSON
   script tags), searched for field names such as `countryOfOrigin`, `manufacturerName`, `mrp`, `packSize`,
   plus label/value spec lists and widgets inside it. The variant in the link (e.g. `?skuId=`) wins.
2. **Visible text** - spec tables, definition lists and label/value pairs, run through the same extractor
   as OCR, counting only values that sit next to their label.
3. **schema.org JSON-LD** - name, price, size and origin as a fallback. The brand is never used as the
   manufacturer, and the listed price ranks below a declared MRP.

Sites that block automated requests (e.g. BigBasket, often Amazon) get a clear message suggesting a label
photo, the **CompliScan this page** bookmarklet (in the web app), or the demo Chrome extension in
[`extension/`](extension/README.md), which check the page from the user's own browser. Details some stores load only after a click (e.g. Myntra's manufacturer popup) are not in
the page and show as missing.

## Environment

Backend:
- `CORS_ORIGINS` (optional) - comma-separated allowed frontend origins; defaults to the current Vercel and localhost origins
- `NODE_ENV=production` - generic error messages, no debug fields in responses

Frontend:
- `VITE_API_BASE_URL` (optional, build time) - backend URL; defaults to the Render deployment. Set to an empty string to use same-origin `/api`
- `API_PROXY_TARGET` (optional, dev server) - where the Vite dev proxy forwards `/api`

URL checks refuse private, loopback, link-local and other internal addresses, re-validate every
redirect hop, and re-check the resolved IP at connect time.
