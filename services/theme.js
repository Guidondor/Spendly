import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const COLORS = {
  green50:  '#f0fdf4',
  green100: '#dcfce7',
  green500: '#22c55e',
  green600: '#16a34a',
  green700: '#15803d',
  green800: '#166534',
  green900: '#14532d',
  green950: '#052e16',
  red400:   '#f43f5e',
  red500:   '#e11d48',
  red600:   '#be123c',
  red700:   '#9f1239',
  white:    '#ffffff',
  gray50:   '#f8fafc',
  gray100:  '#f1f5f9',
  gray200:  '#e2e8f0',
  gray300:  '#cbd5e1',
  gray400:  '#94a3b8',
  gray500:  '#64748b',
  gray600:  '#475569',
  gray700:  '#334155',
  gray800:  '#1e293b',
  gray900:  '#0f172a',
  black:    '#000000',
  warning:  '#f59e0b',
  info:     '#3b82f6',
  purple:   '#8b5cf6',
};

export const LIGHT = {
  dark: false,
  bg:             '#f6fbf8',
  card:           '#ffffff',
  cardBorder:     '#e4ede8',
  header:         '#0f5132',
  monthRow:       '#0f5132',
  input:          '#f0f7f3',
  inputBorder:    '#d4e8dc',
  toggleBg:       '#e8f5ee',
  chipBg:         '#f0f7f3',
  chipBorder:     '#d4e8dc',
  text:           '#0f2318',
  subtext:        '#5a7a67',
  label:          '#3d6652',
  inputText:      '#0f2318',
  chipText:       '#3d6652',
  sectionText:    '#a0bfac',
  emptyText:      '#a0bfac',
  placeholderText:'#b0c8b8',
  divider:        '#e4ede8',
  accent:         '#16a34a',
  accentBtn:      '#16a34a',
  income:         '#16a34a',
  expense:        '#e11d48',
  navBg:          '#ffffff',
  navBorder:      '#e4ede8',
  navActive:      '#16a34a',
  navInactive:    '#a0bfac',
  statusBar:      'light-content',
};

export const DARK = {
  dark: true,
  bg:             '#0d1a12',
  card:           '#132019',
  cardBorder:     'rgba(22,163,74,0.18)',
  header:         '#0a1a0f',
  monthRow:       '#0a1a0f',
  input:          '#0f2318',
  inputBorder:    'rgba(22,163,74,0.2)',
  toggleBg:       '#0f2318',
  chipBg:         '#0f2318',
  chipBorder:     'rgba(22,163,74,0.2)',
  text:           '#e8f5ee',
  subtext:        '#5d8c6e',
  label:          '#5d8c6e',
  inputText:      '#e8f5ee',
  chipText:       '#5d8c6e',
  sectionText:    '#2a4a35',
  emptyText:      '#2a4a35',
  placeholderText:'#2a4a35',
  divider:        'rgba(22,163,74,0.15)',
  accent:         '#22c55e',
  accentBtn:      '#16a34a',
  income:         '#22c55e',
  expense:        '#f43f5e',
  navBg:          '#0a1a0f',
  navBorder:      'rgba(22,163,74,0.15)',
  navActive:      '#22c55e',
  navInactive:    '#2a4a35',
  statusBar:      'light-content',
};

export const SPACING = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32,
};

export const RADIUS = {
  sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, full: 9999,
};

export const SHADOWS = {
  sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  md: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 6 },
  green: { shadowColor: '#16a34a', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 10, elevation: 10 },
  red: { shadowColor: '#e11d48', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
};

const ThemeContext = createContext({ theme: LIGHT, isDark: false, toggleTheme: () => {}, lang: 'es', setLang: () => {} });

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(false);
  const [lang, setLangState] = useState('es');

  useEffect(() => {
    AsyncStorage.getItem('theme_dark').then(val => { if (val === '1') setIsDark(true); });
    AsyncStorage.getItem('app_lang').then(val => { if (val === 'en' || val === 'es') setLangState(val); });
  }, []);

  function toggleTheme() {
    setIsDark(d => {
      AsyncStorage.setItem('theme_dark', d ? '0' : '1');
      return !d;
    });
  }

  function setLang(l) {
    AsyncStorage.setItem('app_lang', l);
    setLangState(l);
  }

  const theme = isDark ? DARK : LIGHT;
  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme, lang, setLang }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
