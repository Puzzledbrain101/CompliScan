
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

## Environment

Backend:
- `OPENAI_API_KEY` (optional) - enables AI normalization of scraped fields
- `CORS_ORIGINS` (optional) - comma-separated allowed frontend origins; defaults to the current Vercel and localhost origins
- `NODE_ENV=production` - generic error messages, no debug fields in responses

Frontend:
- `VITE_API_BASE_URL` (optional, build time) - backend URL; defaults to the Render deployment. Set to an empty string to use same-origin `/api`
- `API_PROXY_TARGET` (optional, dev server) - where the Vite dev proxy forwards `/api`

URL checks refuse private, loopback, link-local and other internal addresses, re-validate every
redirect hop, and re-check the resolved IP at connect time.
