
# Compliance Dashboard (Demo)

This repository contains a demo frontend (React + Vite) and a simple Express backend to simulate:
- Web scraping (product page)
- OCR parsing (mocked)
- Rule engine for Legal Metrology compliance checks
- A small dashboard UI for seller and backend views

## Run frontend (dev)
```
cd frontend
npm install
npm run dev
```

Open the dev server (usually http://localhost:5173).

## Run backend
```
cd backend
npm install
node server.js
```

The backend exposes `POST /api/check` to accept multipart form data (`image`) or JSON body `url`.

## Notes
- Replace mocked OCR logic with Tesseract.js or Google Vision for real OCR.
- Improve scraping logic per target sites and respect robots.txt.
- Add persistent DB, auth, and production hardening for real use.
