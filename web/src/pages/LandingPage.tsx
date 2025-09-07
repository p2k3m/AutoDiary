import { useAuth } from '../state/useAuth';
import { ThemeButton } from '../components/ThemeButton';

export default function LandingPage() {
  const { login } = useAuth();

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 p-4 text-center">
      <div className="absolute right-4 top-4">
        <ThemeButton />
      </div>
      <h1 className="text-4xl font-bold">Welcome to AutoDiary</h1>
      <div className="flex flex-col gap-4">
        <button
          type="button"
          className="rounded bg-blue-500 px-4 py-2 text-white"
          onClick={() => login('Google')}
        >
          Sign in with Google
        </button>
        <button
          type="button"
          className="rounded bg-blue-500 px-4 py-2 text-white"
          onClick={() => login('Microsoft')}
        >
          Sign in with Microsoft
        </button>
        <button
          type="button"
          className="rounded bg-blue-500 px-4 py-2 text-white"
          onClick={() => login('Apple')}
        >
          Sign in with Apple
        </button>
      </div>
    </div>
  );
}
