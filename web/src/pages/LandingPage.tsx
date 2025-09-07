import { useState } from 'react';
import { useAuth } from '../state/useAuth';
import { ThemeButton } from '../components/ThemeButton';

export default function LandingPage() {
  const { login } = useAuth();
  const [showMenu, setShowMenu] = useState(false);

  const providers = ['Google', 'Microsoft', 'Apple'];

  const handleProviderClick = (provider: string) => {
    login(provider);
    setShowMenu(false);
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 p-4 text-center">
      <div className="absolute right-4 top-4">
        <ThemeButton />
      </div>
      <h1 className="text-4xl font-bold">Welcome to AutoDiary</h1>
      <div className="relative flex flex-col gap-4">
        <button
          type="button"
          className="rounded bg-blue-500 px-4 py-2 text-white"
          onClick={() => setShowMenu((s) => !s)}
        >
          Sign in with Google · Microsoft · Apple
        </button>
        {showMenu && (
          <div className="absolute left-1/2 top-full z-10 mt-2 flex w-max -translate-x-1/2 flex-col rounded border bg-white text-left shadow">
            {providers.map((provider) => (
              <button
                key={provider}
                type="button"
                className="px-4 py-2 hover:bg-gray-100"
                onClick={() => handleProviderClick(provider)}
              >
                {provider}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
