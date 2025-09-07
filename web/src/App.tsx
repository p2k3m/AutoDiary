import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from './state/useAuth';
import { ThemeButton } from './components/ThemeButton';
import { OfflineBanner } from './components/OfflineBanner';
import CalendarPage from './pages/CalendarPage';
import DatePage from './pages/DatePage';
import SettingsPage from './pages/SettingsPage';
import SearchPage from './pages/SearchPage';

function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <OfflineBanner />
      <header className="flex items-center justify-between p-4">
        <nav className="flex gap-4">
          <Link to="/calendar">Calendar</Link>
          <Link to="/search">Search</Link>
          <Link to="/settings">Settings</Link>
        </nav>
        <ThemeButton />
      </header>
      <main className="flex-1 p-4">
        <Routes>
          <Route path="/" element={<Navigate to="/calendar" replace />} />
          <Route path="/calendar/:yyyy?/:mm?" element={<CalendarPage />} />
          <Route path="/date/:ymd" element={<DatePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/search" element={<SearchPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  const { status, login } = useAuth();

  useEffect(() => {
    if (status === 'unauthenticated') {
      login();
    }
  }, [status, login]);

  if (status !== 'authenticated') {
    return null;
  }

  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  );
}
