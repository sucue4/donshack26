import React from 'react';
import { useNavigate } from 'react-router-dom';

const NAV_ITEMS = [
  { section: 'Overview' },
  { path: '/',           label: 'Dashboard' },
  { path: '/field-map',  label: 'Field Map' },
  { section: 'Analytics' },
  { path: '/soil',       label: 'Soil Health' },
  { path: '/water',      label: 'Water Mgmt' },
  { path: '/weather',    label: 'Weather' },
  { section: 'Planning' },
  { path: '/crops',      label: 'Crop Planning' },
  { path: '/pests',      label: 'Pest Control' },
  { section: 'Intelligence' },
  { path: '/advisor',    label: 'AI Advisor' },
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
        <div className="logo-icon">OD</div>
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
              {item.label}
            </button>
          )
        )}
      </nav>
    </aside>
  );
}
