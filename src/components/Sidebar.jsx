import React from 'react';
import { useNavigate } from 'react-router-dom';

const NAV_ITEMS = [
  { section: 'Overview' },
  { path: '/',           icon: '⬡', label: 'Dashboard' },
  { path: '/field-map',  icon: '◎', label: 'Field Map' },
  { section: 'Analytics' },
  { path: '/soil',       icon: '◈', label: 'Soil Health' },
  { path: '/water',      icon: '◉', label: 'Water Mgmt' },
  { path: '/weather',    icon: '☁', label: 'Weather' },
  { section: 'Planning' },
  { path: '/crops',      icon: '❋', label: 'Crop Planning' },
  { path: '/pests',      icon: '⚠', label: 'Pest Control' },
  { section: 'Intelligence' },
  { path: '/advisor',    icon: '◇', label: 'AI Advisor' },
  { path: '/organization', icon: '▦', label: 'Organization' },
];

export default function Sidebar({ currentPath, onNavigate }) {
  const navigate = useNavigate();

  const handleClick = (path) => {
    onNavigate(path);
    navigate(path);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon">🌾</div>
        <div>
          <h1>Oh Deere!</h1>
          <div className="tagline">Precision Agriculture</div>
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
              onClick={() => handleClick(item.path)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          )
        )}
      </nav>
    </aside>
  );
}
