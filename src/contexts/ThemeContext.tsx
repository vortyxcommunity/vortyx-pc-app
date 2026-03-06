import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeName = 'midnight' | 'charcoal' | 'abyss' | 'forest';

interface ThemeContextType {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};

export const THEMES: { value: ThemeName; label: string; description: string }[] = [
  { value: 'midnight', label: 'Midnight Blue', description: 'Deep blue tones' },
  { value: 'charcoal', label: 'Charcoal', description: 'Pure dark monochrome' },
  { value: 'abyss', label: 'Abyss', description: 'Deep purple darkness' },
  { value: 'forest', label: 'Forest', description: 'Dark emerald tones' },
];

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    return (localStorage.getItem('app-theme') as ThemeName) || 'midnight';
  });

  const setTheme = (t: ThemeName) => {
    setThemeState(t);
    localStorage.setItem('app-theme', t);
  };

  useEffect(() => {
    const root = document.documentElement;
    // Remove all theme classes
    root.classList.remove('theme-midnight', 'theme-charcoal', 'theme-abyss', 'theme-forest');
    root.classList.add(`theme-${theme}`);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
