import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from './state/useAuth';
import { ThemeButton } from './components/ThemeButton';
import CalendarPage from './pages/CalendarPage';
import DatePage from './pages/DatePage';
import SettingsPage from './pages/SettingsPage';

function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex justify-end p-4">
        <ThemeButton />
      </header>
      <main className="flex-1 p-4">
        <Routes>
          <Route path="/" element={<Navigate to="/calendar" replace />} />
          <Route path="/calendar/:yyyy?/:mm?" element={<CalendarPage />} />
          <Route path="/date/:ymd" element={<DatePage />} />
          <Route path="/settings" element={<SettingsPage />} />
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
