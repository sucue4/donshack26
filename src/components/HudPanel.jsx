import React from 'react';

export default function HudPanel({ title, icon, children, actions, className = '' }) {
  return (
    <div className={`hud-panel ${className}`}>
      {title && (
        <div className="hud-panel-header">
          <div className="hud-panel-title">
            {icon && <span className="panel-icon">{icon}</span>}
            {title}
          </div>
          {actions && <div className="flex items-center gap-1">{actions}</div>}
        </div>
      )}
      <div className="hud-panel-body">
        {children}
      </div>
    </div>
  );
}
