import { useTheme } from '../state/useTheme';

const labels: Record<string, string> = {
  light: '☀️',
  dark: '🌙',
  paper: '🟤',
};

export function ThemeButton() {
  const { theme, cycleTheme } = useTheme();
  return (
    <button
      onClick={cycleTheme}
      className="rounded px-2 py-1 hover:bg-gray-200 dark:hover:bg-gray-700"
      aria-label="Toggle theme"
    >
      {labels[theme]}
    </button>
  );
}
