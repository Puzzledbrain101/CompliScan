import { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from './icons.jsx';
import { bookmarkletCode } from '../lib/handoff.js';

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export default function BookmarkletCard() {
  const linkRef = useRef(null);
  const [nudge, setNudge] = useState(false);

  // React blocks javascript: URLs in href, so set it on the element directly
  useEffect(() => {
    linkRef.current?.setAttribute('href', bookmarkletCode(window.location.origin));
  }, []);

  return (
    <section className="card bookmarklet" aria-labelledby="bookmarklet-heading">
      <div className="card-head">
        <h2 id="bookmarklet-heading" className="card-title">Check any product page in one click</h2>
        <p className="card-sub">
          Some stores block link checks. This button checks the page you’re on, straight from your browser.
        </p>
      </div>

      <a
        ref={linkRef}
        className="bookmarklet-button"
        draggable="true"
        title="Drag me to your bookmarks bar"
        onClick={(e) => {
          e.preventDefault();
          setNudge(true);
        }}
      >
        <ShieldCheck /> CompliScan this page
      </a>

      {nudge && (
        <p className="form-error" role="status">Drag the button to your bookmarks bar; clicking it here does nothing.</p>
      )}

      <ol className="steps">
        <li>
          Drag the button to your bookmarks bar.
          <span className="steps-hint">
            Don’t see the bar? Press <kbd>{isMac ? '⌘' : 'Ctrl'}</kbd> <kbd>Shift</kbd> <kbd>B</kbd>.
          </span>
        </li>
        <li>Open a product page on any store and click the bookmark. The result opens here.</li>
      </ol>
    </section>
  );
}
