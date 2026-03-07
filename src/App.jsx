import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ErrorBoundary from './components/ErrorBoundary';
import DebugPanel from './components/DebugPanel';
import Dashboard from './pages/Dashboard';
import FieldMap from './pages/FieldMap';
import SoilHealth from './pages/SoilHealth';
import WaterManagement from './pages/WaterManagement';
import CropPlanning from './pages/CropPlanning';
import PestControl from './pages/PestControl';
import Weather from './pages/Weather';
import AIAdvisor from './pages/AIAdvisor';

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/field-map': 'Field Map',
  '/soil': 'Soil Health',
  '/water': 'Water Management',
  '/crops': 'Crop Planning',
  '/pests': 'Pest & Disease Control',
  '/weather': 'Weather Intelligence',
  '/advisor': 'AI Advisor',
};

export default function App() {
  const [currentPath, setCurrentPath] = React.useState('/');
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
    <Router>
      <div className="app-layout">
        <Sidebar currentPath={currentPath} onNavigate={setCurrentPath} />
        <div className="main-area">
          <Header title={PAGE_TITLES[currentPath] || 'Oh Deere!'} onToggleDebug={() => setDebugOpen((v) => !v)} />
          <div className="page-content">
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/field-map" element={<FieldMap />} />
                <Route path="/soil" element={<SoilHealth />} />
                <Route path="/water" element={<WaterManagement />} />
                <Route path="/crops" element={<CropPlanning />} />
                <Route path="/pests" element={<PestControl />} />
                <Route path="/weather" element={<Weather />} />
                <Route path="/advisor" element={<AIAdvisor />} />
              </Routes>
            </ErrorBoundary>
          </div>
        </div>
        <DebugPanel visible={debugOpen} onClose={() => setDebugOpen(false)} />
      </div>
    </Router>
  );
}
