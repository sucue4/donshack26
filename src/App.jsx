import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import FieldMap from './pages/FieldMap';
import SoilHealth from './pages/SoilHealth';
import WaterManagement from './pages/WaterManagement';
import CropPlanning from './pages/CropPlanning';
import PestControl from './pages/PestControl';
import Weather from './pages/Weather';
import AIAdvisor from './pages/AIAdvisor';
import Organization from './pages/Organization';

const PAGE_TITLES = {
  '/': 'Command Center',
  '/field-map': 'Field Map',
  '/soil': 'Soil Health',
  '/water': 'Water Management',
  '/crops': 'Crop Planning',
  '/pests': 'Pest & Disease Control',
  '/weather': 'Weather Intelligence',
  '/advisor': 'AI Advisor',
  '/organization': 'Organization',
};

export default function App() {
  const [currentPath, setCurrentPath] = React.useState('/');

  return (
    <Router>
      <div className="app-layout">
        <Sidebar currentPath={currentPath} onNavigate={setCurrentPath} />
        <div className="main-area">
          <Header title={PAGE_TITLES[currentPath] || 'Oh Deere!'} />
          <div className="page-content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/field-map" element={<FieldMap />} />
              <Route path="/soil" element={<SoilHealth />} />
              <Route path="/water" element={<WaterManagement />} />
              <Route path="/crops" element={<CropPlanning />} />
              <Route path="/pests" element={<PestControl />} />
              <Route path="/weather" element={<Weather />} />
              <Route path="/advisor" element={<AIAdvisor />} />
              <Route path="/organization" element={<Organization />} />
            </Routes>
          </div>
        </div>
      </div>
    </Router>
  );
}
