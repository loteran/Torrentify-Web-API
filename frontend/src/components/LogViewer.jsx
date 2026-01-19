import { useEffect, useRef, useState } from 'react';

function LogViewer({ logs }) {
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef(null);
  const containerRef = useRef(null);

  const scrollToBottom = () => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  const handleScroll = () => {
    if (!containerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

    setAutoScroll(isAtBottom);
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('fr-FR');
  };

  const getLevelIcon = (level) => {
    switch (level) {
      case 'error':
        return '❌';
      case 'warn':
        return '⚠️';
      case 'info':
      default:
        return 'ℹ️';
    }
  };

  return (
    <div className="log-viewer">
      <div className="log-viewer-header">
        <h3>📋 Logs en temps réel</h3>
        <label className="auto-scroll-toggle">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
          />
          <span>Défilement automatique</span>
        </label>
      </div>

      <div
        className="log-viewer-content"
        ref={containerRef}
        onScroll={handleScroll}
      >
        {logs.length === 0 ? (
          <div className="log-empty">
            Aucun log pour le moment...
          </div>
        ) : (
          <>
            {logs.map((log, index) => (
              <div
                key={index}
                className={`log-entry log-${log.level || 'info'}`}
              >
                <span className="log-time">{formatTime(log.timestamp)}</span>
                <span className="log-icon">{getLevelIcon(log.level)}</span>
                <span className="log-message">{log.message}</span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </>
        )}
      </div>

      <div className="log-viewer-footer">
        <span>{logs.length} ligne{logs.length > 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}

export default LogViewer;
