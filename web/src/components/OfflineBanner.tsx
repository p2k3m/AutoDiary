import { useEffect, useState } from 'react';

export function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (online) {
    return null;
  }

  return (
    <div className="bg-red-600 p-2 text-center text-white">
      You are offline
    </div>
  );
}
