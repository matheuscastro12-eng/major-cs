import { useEffect, useReducer } from 'react';

export type CareerTheme = 'dark' | 'light';
const KEY = 'rtm-career-theme-v1';

const listeners = new Set<() => void>();
let current: CareerTheme = read();

function read(): CareerTheme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch { /* sem storage */ }
  return 'dark';
}

// Aplica o tema no <body> pra que tokens --em-* e overrides scoped em
// .career-dash valham em TODO o app (incluindo modais com position: fixed
// que renderizam fora do tree do componente).
function applyBodyClass(theme: CareerTheme): void {
  if (typeof document === 'undefined') return;
  const body = document.body;
  if (!body) return;
  body.classList.add('career-dash');
  body.classList.toggle('career-dash--light', theme === 'light');
}
applyBodyClass(current);

export function getCareerTheme(): CareerTheme {
  return current;
}

export function setCareerTheme(theme: CareerTheme): void {
  current = theme;
  try { localStorage.setItem(KEY, theme); } catch { /* sem storage */ }
  applyBodyClass(theme);
  listeners.forEach((fn) => fn());
}

export function toggleCareerTheme(): CareerTheme {
  const next = current === 'dark' ? 'light' : 'dark';
  setCareerTheme(next);
  return next;
}

export function useCareerTheme(): [CareerTheme, (t: CareerTheme) => void, () => void] {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const fn = () => tick();
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return [current, setCareerTheme, toggleCareerTheme];
}

export function careerDashClass(theme: CareerTheme): string {
  return `career-dash${theme === 'light' ? ' career-dash--light' : ''}`;
}

// Alias semântico: o "tema do dashboard de carreira" foi promovido a tema do
// app inteiro. Componentes fora de carreira devem usar este nome.
export const appDashClass = careerDashClass;
export const useAppTheme = useCareerTheme;
