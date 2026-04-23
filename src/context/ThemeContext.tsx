'use client';

import { createContext, useContext, useEffect, useRef, ReactNode, useSyncExternalStore } from 'react';

type Theme = 'dark' | 'light';

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const ThemeContext = createContext<{
  theme: Theme;
  toggleTheme: () => void;
}>({ theme: 'light', toggleTheme: () => {} });

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem('portal-theme') as Theme | null;
  return stored || getSystemTheme();
}

const subscribers = new Set<() => void>();
let currentTheme: Theme = 'light';

function subscribe(cb: () => void) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

function getSnapshot(): Theme {
  return currentTheme;
}

function setThemeExternal(t: Theme) {
  currentTheme = t;
  localStorage.setItem('portal-theme', t);
  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.classList.add(t);
  subscribers.forEach(cb => cb());
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const initializedRef = useRef(false);
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => 'light' as Theme);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      const saved = getStoredTheme();
      setThemeExternal(saved);
    }

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem('portal-theme')) {
        setThemeExternal(e.matches ? 'dark' : 'light');
      }
    };
    mq.addEventListener('change', onSystemChange);
    return () => mq.removeEventListener('change', onSystemChange);
  }, []);

  const toggleTheme = () => {
    setThemeExternal(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
