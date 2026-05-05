import React from 'react';
import Svg, { Path, Line, Polyline, Rect, Circle, Polygon } from 'react-native-svg';

export const CATEGORIES = [
  { key: 'food',          name: 'Comida',      nameEn: 'Food',          color: '#f97316' },
  { key: 'transport',     name: 'Transporte',  nameEn: 'Transport',     color: '#3b82f6' },
  { key: 'health',        name: 'Salud',       nameEn: 'Health',        color: '#ec4899' },
  { key: 'housing',       name: 'Vivienda',    nameEn: 'Housing',       color: '#8b5cf6' },
  { key: 'entertainment', name: 'Ocio',        nameEn: 'Entertainment', color: '#f59e0b' },
  { key: 'shopping',      name: 'Compras',     nameEn: 'Shopping',      color: '#06b6d4' },
  { key: 'education',     name: 'Educación',   nameEn: 'Education',     color: '#6366f1' },
  { key: 'income',        name: 'Ingreso',     nameEn: 'Income',        color: '#16a34a' },
  { key: 'other',         name: 'Otro',        nameEn: 'Other',         color: '#64748b' },
];

export function IconFood({ size = 22, color = '#64748b' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M18 8h1a4 4 0 0 1 0 8h-1" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <Path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" stroke={color} strokeWidth="2"/>
      <Line x1="6" y1="1" x2="6" y2="4" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <Line x1="10" y1="1" x2="10" y2="4" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <Line x1="14" y1="1" x2="14" y2="4" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </Svg>
  );
}

export function IconTransport({ size = 22, color = '#64748b' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="1" y="3" width="15" height="13" rx="2" stroke={color} strokeWidth="2"/>
      <Path d="M16 8h4l3 3v5h-7V8z" stroke={color} strokeWidth="2" strokeLinejoin="round"/>
      <Circle cx="5.5" cy="18.5" r="2.5" stroke={color} strokeWidth="2"/>
      <Circle cx="18.5" cy="18.5" r="2.5" stroke={color} strokeWidth="2"/>
    </Svg>
  );
}

export function IconHealth({ size = 22, color = '#64748b' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

export function IconHousing({ size = 22, color = '#64748b' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <Polyline points="9,22 9,12 15,12 15,22" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

export function IconEntertainment({ size = 22, color = '#64748b' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polygon points="23,7 16,12 23,17" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <Rect x="1" y="5" width="15" height="14" rx="2" stroke={color} strokeWidth="2"/>
    </Svg>
  );
}

export function IconShopping({ size = 22, color = '#64748b' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <Line x1="3" y1="6" x2="21" y2="6" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <Path d="M16 10a4 4 0 0 1-8 0" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </Svg>
  );
}

export function IconEducation({ size = 22, color = '#64748b' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <Path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

export function IconIncome({ size = 22, color = '#64748b' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="12" y1="1" x2="12" y2="23" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <Path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

export function IconOther({ size = 22, color = '#64748b' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2"/>
      <Line x1="12" y1="8" x2="12" y2="12" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <Line x1="12" y1="16" x2="12.01" y2="16" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </Svg>
  );
}

const ICON_MAP = {
  food:          IconFood,
  transport:     IconTransport,
  health:        IconHealth,
  housing:       IconHousing,
  entertainment: IconEntertainment,
  shopping:      IconShopping,
  education:     IconEducation,
  income:        IconIncome,
  other:         IconOther,
};

export function CategoryIcon({ catKey, size = 22, color = '#64748b' }) {
  const Icon = ICON_MAP[catKey] || IconOther;
  return <Icon size={size} color={color} />;
}

export function getCategoryByKey(key, lang = 'es', extraCats = []) {
  const all = [...CATEGORIES, ...extraCats];
  const cat = all.find(c => c.key === key) || CATEGORIES[CATEGORIES.length - 1];
  return { ...cat, name: lang === 'en' ? (cat.nameEn || cat.name) : cat.name };
}

export const EXPENSE_CATEGORIES = CATEGORIES.filter(c => c.key !== 'income');
export const INCOME_CATEGORIES  = CATEGORIES.filter(c => c.key === 'income' || c.key === 'other');
