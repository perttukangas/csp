import { useState, useEffect } from 'react';
import './HtmlPreview.css';

interface HtmlPreviewProps {
  url: string;
  html: string | null;
  onClose: () => void;
}

function HtmlPreview({ url, html, onClose }: HtmlPreviewProps) {
  const [viewMode, setViewMode] = useState<'rendered' | 'source'>('source');
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    // Prevent body scroll when preview is open
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleDownload = () => {
    if (!html) return;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `page-${new Date().getTime()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopySource = () => {
    if (!html) return;
    navigator.clipboard.writeText(html);
  };

  if (!html) {
    return (
      <div className="html-preview-overlay" onClick={handleOverlayClick}>
        <div className="html-preview-modal">
          <div className="preview-header">
            <h3>HTML Preview</h3>
            <button className="close-btn" onClick={onClose}>
              ✕
            </button>
          </div>
          <div className="preview-content">
            <div className="no-html-message">
              No HTML content available for this URL
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="html-preview-overlay" onClick={handleOverlayClick}>
      <div className="html-preview-modal">
        <div className="preview-header">
          <div className="preview-title">
            <h3>HTML Preview</h3>
            <div className="preview-url" title={url}>
              {new URL(url).hostname}
            </div>
          </div>
          <div className="preview-controls">
            <div className="view-mode-toggle">
              <button
                className={viewMode === 'rendered' ? 'active' : ''}
                onClick={() => setViewMode('rendered')}
              >
                👁️ Rendered
              </button>
              <button
                className={viewMode === 'source' ? 'active' : ''}
                onClick={() => setViewMode('source')}
              >
                📄 Source
              </button>
            </div>
            {viewMode === 'rendered' && (
              <div className="zoom-controls">
                <button
                  onClick={() => setScale(Math.max(0.25, scale - 0.1))}
                  disabled={scale <= 0.25}
                >
                  🔍−
                </button>
                <span className="zoom-level">{Math.round(scale * 100)}%</span>
                <button
                  onClick={() => setScale(Math.min(1.5, scale + 0.1))}
                  disabled={scale >= 1.5}
                >
                  🔍+
                </button>
              </div>
            )}
            <div className="action-buttons">
              {viewMode === 'source' && (
                <button className="action-btn" onClick={handleCopySource}>
                  📋 Copy
                </button>
              )}
              <button className="action-btn" onClick={handleDownload}>
                💾 Download
              </button>
            </div>
            <button className="close-btn" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <div className="preview-content">
          {viewMode === 'rendered' ? (
            <div className="rendered-view">
              <iframe
                srcDoc={html}
                sandbox="allow-same-origin"
                style={{
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                  width: `${100 / scale}%`,
                  height: `${100 / scale}%`,
                }}
                title="HTML Preview"
              />
            </div>
          ) : (
            <div className="source-view">
              <pre>
                <code>{html}</code>
              </pre>
            </div>
          )}
        </div>

        <div className="preview-footer">
          <div className="html-stats">
            {html.length.toLocaleString()} characters
            {' • '}
            {(html.length / 1024).toFixed(2)} KB
          </div>
        </div>
      </div>
    </div>
  );
}

export default HtmlPreview;
