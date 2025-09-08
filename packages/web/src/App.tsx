import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './state/useAuth';
import { OfflineBanner } from './components/OfflineBanner';
import { Header } from './components/Header';
import CalendarPage from './pages/CalendarPage';
import DatePage from './pages/DatePage';
import SettingsPage from './pages/SettingsPage';
import SearchPage from './pages/SearchPage';
import LandingPage from './pages/LandingPage';
import WeeklyReviewPage from './pages/WeeklyReviewPage';
import ConnectorsPage from './pages/ConnectorsPage';

function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <OfflineBanner />
      <Header />
      <main className="flex-1 p-4">
        <Routes>
          <Route path="/" element={<Navigate to="/calendar" replace />} />
          <Route path="/calendar/:yyyy?/:mm?" element={<CalendarPage />} />
          <Route path="/date/:ymd" element={<DatePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/weekly" element={<WeeklyReviewPage />} />
          <Route path="/connectors" element={<ConnectorsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  const { status } = useAuth();

  if (status !== 'authenticated') {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<LandingPage />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  );
}
