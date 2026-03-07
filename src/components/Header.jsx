import React, { useState, useEffect } from 'react';

export default function Header({ title, onToggleDebug }) {
  const [time, setTime] = useState(new Date());
  const [backendUp, setBackendUp] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const res = await fetch('/api/health');
        setBackendUp(res.ok);
      } catch {
        setBackendUp(false);
      }
    };
    checkBackend();
    const interval = setInterval(checkBackend, 30000);
    return () => clearInterval(interval);
  }, []);

  const dateStr = time.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
  const timeStr = time.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit',
  });

  const handleMinimize = () => window.electronAPI?.minimize();
  const handleMaximize = () => window.electronAPI?.maximize();
  const handleClose = () => window.electronAPI?.close();

  return (
    <header className="header">
      <div className="header-left">
        <h2 className="header-title">{title}</h2>
      </div>
      <div className="header-right">
        <div className="header-status">
          <span className="status-dot" style={{
            background: backendUp === null ? '#c0a030' : backendUp ? '#3d7a4a' : '#b5403a',
          }} />
          <span>{backendUp === null ? 'Checking...' : backendUp ? 'Online' : 'Backend Offline'}</span>
          <span style={{ margin: '0 4px', color: '#e2e0dc' }}>|</span>
          <span>{dateStr} &middot; {timeStr}</span>
        </div>
        {onToggleDebug && (
          <button className="btn" onClick={onToggleDebug}
            style={{ padding: '3px 8px', fontSize: 10 }}
            title="Toggle Debug Panel (Ctrl+Shift+D)">
            Debug
          </button>
        )}
        <div className="window-controls">
          <button className="window-btn minimize" onClick={handleMinimize} />
          <button className="window-btn maximize" onClick={handleMaximize} />
          <button className="window-btn close" onClick={handleClose} />
        </div>
      </div>
    </header>
  );
}
