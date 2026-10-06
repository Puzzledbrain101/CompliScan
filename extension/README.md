# CompliScan Chrome extension (demo)

Click the CompliScan icon on any product page to check it against the Legal Metrology declarations. The page is read from your browser, so stores that block link checks still work, and anything you've opened on the page (e.g. a "manufacturer details" popup) is included.

Not published to the Chrome Web Store. Load it unpacked for demos.

## Set up

1. Start the backend and web app (from the repo root):
   ```bash
   cd backend && npm start                       # http://localhost:8000
   cd frontend && VITE_API_BASE_URL=http://localhost:8000 npm run dev -- --port 5173
   ```
2. In Chrome, open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose this `extension/` folder.
4. Pin it: click the puzzle-piece icon in the toolbar, then the pin next to **CompliScan (demo)**.

## Use

Open a product page (Nykaa, Flipkart, any store) and click the CompliScan icon. The popup shows the status, score and each declaration. **Open full result** opens the check in the web app; it's also in the web app's history.

## Point it at a deployed backend

Edit `config.js`:

```js
export const API_BASE_URL = 'https://your-backend.onrender.com';
export const APP_URL = 'https://your-app.vercel.app';
```

`*.onrender.com` and `localhost` are already allowed in `manifest.json`. For another host, add it to `host_permissions`. Then click the reload icon on the extension's card in `chrome://extensions`.

## Notes

- Permissions: `activeTab` + `scripting` read the current tab only when you click the icon. Page HTML is sent to your backend's `/api/check-page` and is not stored.
- Chrome may show a "Disable developer mode extensions" notice at startup; dismiss it to keep the extension.
- The popup's field list mirrors `frontend/src/lib/results.js`; keep the two in sync when declarations change.
