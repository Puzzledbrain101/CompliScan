import { useEffect, useId, useRef, useState } from 'react';
import { ImageIcon, LinkIcon, Upload, X } from './icons.jsx';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024;

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function checkFile(file) {
  if (!ACCEPTED_TYPES.includes(file.type)) return 'Use a JPG, PNG, GIF or WebP image.';
  if (file.size > MAX_BYTES) return `That image is ${formatBytes(file.size)}. The limit is 10 MB.`;
  return null;
}

function checkUrl(value) {
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol)) return 'Enter a link that starts with http:// or https://';
    return null;
  } catch {
    return 'Enter a full product link, e.g. https://www.amazon.in/…';
  }
}

export default function Scanner({ busy, onCheck }) {
  const [mode, setMode] = useState('image');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const ids = { file: useId(), url: useId(), error: useId() };

  // Object URL for the thumbnail, revoked when the file changes
  useEffect(() => {
    if (!file) return setPreview(null);
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  // Paste a screenshot straight into the photo tab
  useEffect(() => {
    if (mode !== 'image' || busy) return;
    const onPaste = (e) => {
      const pasted = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/'));
      if (pasted) {
        e.preventDefault();
        pickFile(pasted);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [mode, busy]);

  function pickFile(next) {
    const problem = next ? checkFile(next) : null;
    setError(problem);
    setFile(problem ? null : next);
  }

  function clearFile() {
    setFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  function switchMode(next) {
    setMode(next);
    setError(null);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    if (mode === 'image') {
      if (!file) return setError('Choose a photo of the label first.');
      onCheck({ kind: 'image', file });
    } else {
      const problem = checkUrl(url);
      if (problem) return setError(problem);
      onCheck({ kind: 'url', url: url.trim() });
    }
  }

  const ready = mode === 'image' ? Boolean(file) : url.trim().length > 0;

  return (
    <form className="card scanner" onSubmit={handleSubmit} noValidate>
      <div className="card-head">
        <h2 className="card-title">New check</h2>
        <p className="card-sub">Scan a label photo or a product listing.</p>
      </div>

      <div className="segmented" role="group" aria-label="What to check">
        <button
          type="button"
          className="segmented-item"
          aria-pressed={mode === 'image'}
          onClick={() => switchMode('image')}
          disabled={busy}
        >
          <ImageIcon /> Label photo
        </button>
        <button
          type="button"
          className="segmented-item"
          aria-pressed={mode === 'url'}
          onClick={() => switchMode('url')}
          disabled={busy}
        >
          <LinkIcon /> Product link
        </button>
      </div>

      {mode === 'image' ? (
        file ? (
          <div className="file-chip">
            {preview && <img className="file-thumb" src={preview} alt="" />}
            <div className="file-meta">
              <span className="file-name" title={file.name}>{file.name}</span>
              <span className="file-size">{formatBytes(file.size)}</span>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={clearFile}
              disabled={busy}
              aria-label="Remove photo"
            >
              <X />
            </button>
          </div>
        ) : (
          <label
            htmlFor={ids.file}
            className="dropzone"
            data-dragging={dragging || undefined}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pickFile(e.dataTransfer.files?.[0]);
            }}
          >
            <span className="dropzone-icon"><Upload /></span>
            <span className="dropzone-title">Drop a label photo, or <u>browse</u></span>
            <span className="dropzone-hint">JPG, PNG, GIF or WebP up to 10 MB. You can also paste a screenshot.</span>
            <input
              ref={inputRef}
              id={ids.file}
              className="visually-hidden"
              type="file"
              accept={ACCEPTED_TYPES.join(',')}
              onChange={(e) => pickFile(e.target.files?.[0])}
              aria-describedby={error ? ids.error : undefined}
            />
          </label>
        )
      ) : (
        <div className="field">
          <label htmlFor={ids.url} className="field-label">Product page URL</label>
          <input
            id={ids.url}
            className="input"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck="false"
            placeholder="https://www.amazon.in/…"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setError(null); }}
            disabled={busy}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? ids.error : undefined}
          />
          <p className="field-hint">Works best with Amazon, Flipkart, Myntra and Nykaa.</p>
        </div>
      )}

      {error && <p id={ids.error} className="form-error" role="alert">{error}</p>}

      <button type="submit" className="button button-primary button-block" disabled={busy || !ready}>
        {busy ? <><span className="spinner" aria-hidden="true" /> Checking…</> : 'Run check'}
      </button>

      <p className="scanner-foot">
        Checks the mandatory declarations under the Legal Metrology (Packaged Commodities) Rules, 2011.
      </p>
    </form>
  );
}
