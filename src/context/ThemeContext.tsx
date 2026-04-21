'use client';

import { createContext, useContext, useEffect, useRef, ReactNode, useSyncExternalStore } from 'react';

type Theme = 'dark' | 'light';

const ThemeContext = createContext<{
  theme: Theme;
  toggleTheme: () => void;
}>({ theme: 'dark', toggleTheme: () => {} });

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return (localStorage.getItem('portal-theme') as Theme) || 'dark';
}

const subscribers = new Set<() => void>();
let currentTheme: Theme = 'dark';

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
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => 'dark' as Theme);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      const saved = getStoredTheme();
      setThemeExternal(saved);
    }
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
