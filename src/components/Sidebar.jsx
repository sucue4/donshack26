import React from 'react';
import { useNavigate } from 'react-router-dom';

const NAV_ITEMS = [
  { section: 'Overview' },
  { path: '/',           label: 'Yield Dashboard' },
  { section: 'Yield Analysis' },
  { path: '/weather',    label: 'Weather Forecasting' },
  { path: '/soil',       label: 'Soil Health' },
  { path: '/pests',      label: 'Pest Forecasting' },
  { path: '/drought',    label: 'Drought Resistance' },
  { path: '/monoculture', label: 'Monoculture Risk' },
];

export default function Sidebar({ currentPath }) {
  const navigate = useNavigate();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon">OD</div>
        <div>
          <h1>Oh Deere!</h1>
          <div className="tagline">Yield Rate Intelligence</div>
        </div>
      </div>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item, i) =>
          item.section ? (
            <div key={i} className="nav-section-label">{item.section}</div>
          ) : (
            <button
              key={item.path}
              className={`nav-item${currentPath === item.path ? ' active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              {item.label}
            </button>
          )
        )}
      </nav>
    </aside>
  );
}
