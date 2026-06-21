// Identidade do manager (nick, nome, idade, país, cor, org) — criada na tela de
// Setup e usada no MainMenu, no perfil e como semente da org na carreira.
import { useCallback, useState } from 'react';

export interface Manager { nick: string; name: string; age: number; country: string; accent: string; org: string; }

const KEY = 'rtm-manager-v1';
export const ACCENTS = ['#4382b6', '#d8a943', '#6fd06f', '#c792ea', '#e25a5a', '#6fc3df'];
export const SETUP_COUNTRIES: [string, string][] = [['br', 'Brasil'], ['us', 'EUA'], ['se', 'Suécia'], ['ua', 'Ucrânia'], ['dk', 'Dinamarca'], ['fr', 'França'], ['pt', 'Portugal'], ['ar', 'Argentina']];

export function getManager(): Manager | null {
  try { const s = localStorage.getItem(KEY); return s ? (JSON.parse(s) as Manager) : null; } catch { return null; }
}
export function saveManager(m: Manager) {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* sem storage */ }
}

export function useManager() {
  const [manager, setManager] = useState<Manager | null>(getManager);
  const save = useCallback((m: Manager) => { saveManager(m); setManager(m); }, []);
  return { manager, saveManager: save };
}
