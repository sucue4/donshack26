import React from 'react';
import { HashRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ErrorBoundary from './components/ErrorBoundary';
import DebugPanel from './components/DebugPanel';
import Dashboard from './pages/Dashboard';
import Onboarding from './pages/Onboarding';
import FieldMap from './pages/FieldMap';
import WeatherForecast from './pages/WeatherForecast';
import SoilHealth from './pages/SoilHealth';
import PestForecast from './pages/PestForecast';
import DroughtResistance from './pages/DroughtResistance';
import MonocultureRisk from './pages/MonocultureRisk';

const PAGE_TITLES = {
  '/': 'Yield Dashboard',
  '/onboarding': 'Farm Setup',
  '/field-map': 'Field Map',
  '/weather': 'Weather Forecasting',
  '/soil': 'Soil Health',
  '/pests': 'Pest Forecasting',
  '/drought': 'Drought Resistance',
  '/monoculture': 'Monoculture Risk',
};

function AppContent() {
  const location = useLocation();
  const currentPath = location.pathname;
  const [debugOpen, setDebugOpen] = React.useState(false);

  React.useEffect(() => {
    const handleKey = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setDebugOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <div className="app-layout">
      <Sidebar currentPath={currentPath} />
      <div className="main-area">
        <Header title={PAGE_TITLES[currentPath] || 'Oh Deere!'} onToggleDebug={() => setDebugOpen((v) => !v)} />
        <div className="page-content">
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/field-map" element={<FieldMap />} />
              <Route path="/weather" element={<WeatherForecast />} />
              <Route path="/soil" element={<SoilHealth />} />
              <Route path="/pests" element={<PestForecast />} />
              <Route path="/drought" element={<DroughtResistance />} />
              <Route path="/monoculture" element={<MonocultureRisk />} />
            </Routes>
          </ErrorBoundary>
        </div>
      </div>
      <DebugPanel visible={debugOpen} onClose={() => setDebugOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}
