import { useCallback, useEffect, useRef, useState } from 'react';
import Scanner from './components/Scanner.jsx';
import ResultPanel from './components/ResultPanel.jsx';
import Analytics from './components/Analytics.jsx';
import History from './components/History.jsx';
import BookmarkletCard from './components/BookmarkletCard.jsx';
import { ShieldCheck } from './components/icons.jsx';
import { getAnalytics, getCheck, getHistory, runCheck } from './lib/api.js';
import { statusOf, toEntry } from './lib/results.js';
import { clearHandoffParam, isHandoffLaunch, listenForPage } from './lib/handoff.js';

const HANDOFF_TIMEOUT_MS = 15000;

export default function App() {
  const [scan, setScan] = useState({ state: 'idle' }); // idle | loading | error
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState({ items: [], loading: true, error: null });
  const [analytics, setAnalytics] = useState({ data: null, loading: true, error: null });
  const [announcement, setAnnouncement] = useState('');
  const resultRef = useRef(null);

  const loadHistory = useCallback(async () => {
    setHistory(h => ({ ...h, loading: true, error: null }));
    try {
      const items = await getHistory();
      setHistory({ items, loading: false, error: null });
    } catch (err) {
      setHistory(h => ({ ...h, loading: false, error: err.message }));
    }
  }, []);

  const loadAnalytics = useCallback(async () => {
    setAnalytics(a => ({ ...a, loading: true, error: null }));
    try {
      const data = await getAnalytics();
      setAnalytics({ data, loading: false, error: null });
    } catch (err) {
      setAnalytics(a => ({ ...a, loading: false, error: err.message }));
    }
  }, []);

  useEffect(() => {
    loadHistory();
    loadAnalytics();
  }, [loadHistory, loadAnalytics]);

  // Opened with ?check=<id> (e.g. "Open full result" in the extension): show that check
  useEffect(() => {
    const url = new URL(window.location.href);
    const id = url.searchParams.get('check');
    if (!id) return;
    url.searchParams.delete('check');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    setScan({ state: 'loading', kind: 'saved' });
    getCheck(id)
      .then(entry => {
        setSelected(entry);
        setScan({ state: 'idle' });
      })
      .catch(err => setScan({
        state: 'error',
        message: /not found/i.test(err.message) ? 'That check could not be found. It may have been removed.' : err.message
      }));
  }, []);

  // Opened by the bookmarklet: wait for the store page it sends
  useEffect(() => {
    if (!isHandoffLaunch()) return;
    setScan({ state: 'loading', kind: 'page' });
    const timer = setTimeout(() => {
      stopListening();
      clearHandoffParam();
      setScan({ state: 'error', message: 'No page arrived from the store tab. Go back to the product page and click the bookmark again.' });
    }, HANDOFF_TIMEOUT_MS);
    const stopListening = listenForPage(({ url, html }) => {
      clearTimeout(timer);
      clearHandoffParam();
      handleCheck({ kind: 'page', url, html });
    });
    return () => {
      clearTimeout(timer);
      stopListening();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bring the result panel into view when its top is off screen (below the
  // form on narrow screens, or above the history list on any screen)
  function revealResult() {
    const panel = resultRef.current;
    if (!panel) return;
    const { top } = panel.getBoundingClientRect();
    if (top >= 0 && top < window.innerHeight * 0.5) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    panel.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    panel.focus({ preventScroll: true });
  }

  async function handleCheck(input) {
    setScan({ state: 'loading', kind: input.kind, input });
    setSelected(null);
    setAnnouncement('');
    revealResult();
    try {
      const entry = toEntry(await runCheck(input), input);
      setSelected(entry);
      setScan({ state: 'idle' });
      setAnnouncement(`Check complete: ${statusOf(entry.status).label}, score ${entry.compliance_score} out of 100.`);
      setHistory(h => ({ ...h, items: [entry, ...h.items.filter(i => i.id !== entry.id)] }));
      loadAnalytics();
    } catch (err) {
      setScan({ state: 'error', message: err.message, input });
    }
  }

  function handleSelect(entry) {
    setSelected(entry);
    setScan({ state: 'idle' });
    revealResult();
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">
            <span className="brand-mark"><ShieldCheck /></span>
            CompliScan
          </span>
          <span className="topbar-tag">Legal Metrology label checks</span>
        </div>
      </header>

      <main className="main">
        <div className="workspace">
          <div className="sidebar">
            <Scanner busy={scan.state === 'loading'} onCheck={handleCheck} />
            <BookmarkletCard />
          </div>
          <ResultPanel
            ref={resultRef}
            scan={scan}
            entry={selected}
            onRetry={scan.input ? () => handleCheck(scan.input) : undefined}
          />
        </div>

        <Analytics state={analytics} onRetry={loadAnalytics} />
        <History
          state={history}
          selectedId={selected?.id}
          onSelect={handleSelect}
          onRefresh={loadHistory}
        />
      </main>

      <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>
    </div>
  );
}
