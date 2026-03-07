import React, { useState, useEffect } from 'react';

export default function Header({ title }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const dateStr = time.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
  const timeStr = time.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
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
          <div className="status-dot" />
          <span>Systems Online</span>
        </div>
        <div className="header-status" style={{ marginLeft: 8 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: 1 }}>
            {dateStr} &middot; {timeStr}
          </span>
        </div>
        <div className="window-controls">
          <button className="window-btn minimize" onClick={handleMinimize} />
          <button className="window-btn maximize" onClick={handleMaximize} />
          <button className="window-btn close" onClick={handleClose} />
        </div>
      </div>
    </header>
  );
}
