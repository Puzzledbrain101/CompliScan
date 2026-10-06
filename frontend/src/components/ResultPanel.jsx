import { forwardRef } from 'react';
import { Alert, Check, ExternalLink, Eye, ImageIcon, LinkIcon, Minus, X } from './icons.jsx';
import {
  FIELDS, REQUIRED_FIELDS, fieldStates, formatFull, sourceLabel, statusOf, summarize
} from '../lib/results.js';

const STATE_ICON = { ok: Check, invalid: Alert, missing: X, unverifiable: Eye, absent: Minus };

function fieldNote(field, inputType) {
  switch (field.state) {
    case 'missing': return inputType === 'url' ? 'Not found on the listing' : 'Not found on the label';
    case 'invalid': return 'Found, but the format doesn’t look right';
    case 'unverifiable': return 'Listings rarely show this. Check the physical pack.';
    case 'absent': return 'Not detected';
    default: return null;
  }
}

export function StatusBadge({ status, size }) {
  const { label, tone } = statusOf(status);
  return <span className={`badge badge-${tone}${size === 'lg' ? ' badge-lg' : ''}`}>{label}</span>;
}

function EmptyState() {
  return (
    <div className="result-empty">
      <h2 className="card-title">What gets checked</h2>
      <p className="card-sub">
        Every pre-packaged product sold in India must declare these on the pack.
      </p>
      <ol className="checklist">
        {REQUIRED_FIELDS.map(field => (
          <li key={field.key}>
            <span className="checklist-label">{field.label}</span>
            <span className="checklist-hint">{field.hint}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function LoadingState({ kind }) {
  return (
    <div className="result-loading" aria-busy="true">
      <div className="loading-head">
        <span className="spinner spinner-accent" aria-hidden="true" />
        <div>
          <p className="loading-title" role="status">
            {{ image: 'Reading the label…', page: 'Checking the page you sent…', saved: 'Opening the saved check…' }[kind] || 'Fetching the product page…'}
          </p>
          <p className="card-sub">
            {{ image: 'Text recognition usually takes 10–30 seconds.', page: 'This takes a second.', saved: 'Just a moment.' }[kind] || 'This takes a few seconds.'}
          </p>
        </div>
      </div>
      <ul className="field-list" aria-hidden="true">
        {FIELDS.map(field => (
          <li key={field.key} className="field-row">
            <span className="skeleton skeleton-dot" />
            <span className="field-label-text">{field.label}</span>
            <span className="skeleton skeleton-line" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ErrorState({ message, onRetry, blocked }) {
  return (
    <div className="result-error" role="alert">
      <span className="result-error-icon"><Alert /></span>
      <div>
        <h2 className="card-title">The check didn’t finish</h2>
        <p className="card-sub">{message}</p>
        {blocked && (
          <p className="card-sub result-error-tip">
            Tip: open the product page yourself and use the <strong>CompliScan this page</strong> bookmark. It checks the page from your browser, so the store can’t block it.
          </p>
        )}
        {onRetry && (
          <button type="button" className="button button-secondary" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

function Result({ entry }) {
  const fields = fieldStates(entry);
  const summary = summarize(entry);
  const { tone } = statusOf(entry.status);
  const score = Math.max(0, Math.min(100, entry.compliance_score ?? 0));
  const SourceIcon = entry.input_type === 'url' ? LinkIcon : ImageIcon;

  return (
    <div className="result">
      <header className="result-head">
        <div className="result-title-block">
          <StatusBadge status={entry.status} size="lg" />
          <h2 className="result-title">{entry.parsed?.product_name || 'Unnamed product'}</h2>
          <p className="result-meta">
            {entry.input_type === 'url' && entry.input_source ? (
              <a href={entry.input_source} target="_blank" rel="noopener noreferrer" className="result-source">
                <SourceIcon /> {sourceLabel(entry)} <ExternalLink />
              </a>
            ) : (
              <span className="result-source"><SourceIcon /> {sourceLabel(entry)}</span>
            )}
            <time dateTime={entry.timestamp}>{formatFull(entry.timestamp)}</time>
          </p>
        </div>
        <div className={`score score-${tone}`}>
          <span className="score-value">{score}</span>
          <span className="score-max">/100</span>
        </div>
      </header>

      <div className="meter" role="img" aria-label={`Compliance score ${score} out of 100`}>
        <span className={`meter-fill meter-${tone}`} style={{ '--value': score / 100 }} />
      </div>
      <p className="result-summary">
        <strong>{summary.found} of {summary.checkable}</strong> required declarations found
        {summary.invalid > 0 && <> · {summary.invalid} with format problems</>}
        {summary.unverifiable > 0 && <> · {summary.unverifiable} to verify on the pack</>}
      </p>

      <ul className="field-list">
        {fields.map(field => {
          const Icon = STATE_ICON[field.state];
          const note = fieldNote(field, entry.input_type);
          return (
            <li key={field.key} className="field-row" data-state={field.state}>
              <span className="field-state"><Icon /></span>
              <span className="field-label-text">{field.label}</span>
              <span className="field-value">
                {field.value && field.state !== 'missing' && <span className="field-value-text">{field.value}</span>}
                {note && <span className="field-note">{note}</span>}
              </span>
            </li>
          );
        })}
      </ul>

      {entry.reasons?.length > 0 && (
        <div className="callout callout-warn">
          <Alert />
          <div>
            <p className="callout-title">Photo quality may affect these results</p>
            <ul>{entry.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
          </div>
        </div>
      )}
    </div>
  );
}

const ResultPanel = forwardRef(function ResultPanel({ scan, entry, onRetry }, ref) {
  let content;
  if (scan.state === 'loading') content = <LoadingState kind={scan.kind} />;
  else if (scan.state === 'error') {
    const blocked = scan.input?.kind === 'url' && /blocked|bot check/i.test(scan.message || '');
    content = <ErrorState message={scan.message} onRetry={onRetry} blocked={blocked} />;
  }
  else if (entry) content = <Result key={entry.id} entry={entry} />;
  else content = <EmptyState />;

  return (
    <section ref={ref} className="card result-panel" aria-label="Check result" tabIndex={-1}>
      {content}
    </section>
  );
});

export default ResultPanel;
