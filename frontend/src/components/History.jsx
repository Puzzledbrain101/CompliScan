import { ImageIcon, LinkIcon, Refresh } from './icons.jsx';
import { StatusBadge } from './ResultPanel.jsx';
import { formatFull, formatWhen, sourceLabel } from '../lib/results.js';

export default function History({ state, selectedId, onSelect, onRefresh }) {
  const { items, loading, error } = state;

  return (
    <section className="section" aria-labelledby="history-heading">
      <div className="section-head">
        <h2 id="history-heading" className="section-title">
          Recent checks {items.length > 0 && <span className="count">{items.length}</span>}
        </h2>
        <button
          type="button"
          className="button button-ghost button-sm"
          onClick={onRefresh}
          disabled={loading}
        >
          <Refresh /> Refresh
        </button>
      </div>

      <div className="card history">
        {error ? (
          <div className="inline-error">
            <p>Couldn’t load recent checks. {error}</p>
            <button type="button" className="button button-secondary" onClick={onRefresh}>Retry</button>
          </div>
        ) : loading && items.length === 0 ? (
          <ul className="history-list" aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="history-skeleton">
                <span className="skeleton skeleton-line" />
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <p className="history-empty">No checks yet. Results you run will appear here.</p>
        ) : (
          <ul className="history-list">
            {items.map(entry => {
              const SourceIcon = entry.input_type === 'url' ? LinkIcon : ImageIcon;
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    className="history-row"
                    aria-current={entry.id === selectedId || undefined}
                    onClick={() => onSelect(entry)}
                  >
                    <span className="history-icon"><SourceIcon /></span>
                    <span className="history-main">
                      <span className="history-name">{entry.parsed?.product_name || 'Unnamed product'}</span>
                      <span className="history-source">{sourceLabel(entry)}</span>
                    </span>
                    <StatusBadge status={entry.status} />
                    <span className="history-score">{entry.compliance_score}</span>
                    <time className="history-when" dateTime={entry.timestamp} title={formatFull(entry.timestamp)}>
                      {formatWhen(entry.timestamp)}
                    </time>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
