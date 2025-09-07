import { create } from 'zustand';

export type Theme = 'light' | 'dark' | 'paper';

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  cycleTheme: () => void;
}

const themes: Theme[] = ['light', 'dark', 'paper'];

const initialTheme: Theme = (() => {
  const saved = localStorage.getItem('theme');
  if (saved === 'light' || saved === 'dark' || saved === 'paper') {
    return saved;
  }
  return 'light';
})();

export const useTheme = create<ThemeState>((set, get) => ({
  theme: initialTheme,
  setTheme: (t) => {
    localStorage.setItem('theme', t);
    document.documentElement.dataset.theme = t;
    set({ theme: t });
  },
  cycleTheme: () => {
    const idx = themes.indexOf(get().theme);
    const next = themes[(idx + 1) % themes.length];
    get().setTheme(next);
  },
}));

// apply theme on init
if (typeof document !== 'undefined') {
  document.documentElement.dataset.theme = initialTheme;
}
