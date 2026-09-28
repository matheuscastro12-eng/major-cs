// Contexto global do shell: o App entrega a lista de modos (trilho), o usuário
// e os comandos globais; cada tela entrega só as próprias seções pro GameShell.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ShellGlobal } from './types';

const EMPTY: ShellGlobal = { modes: [], commands: [] };
const Ctx = createContext<ShellGlobal>(EMPTY);

export function ShellProvider({ value, children }: { value: ShellGlobal; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShellGlobal(): ShellGlobal {
  return useContext(Ctx);
}

// ── densidade (compacto/confortável) ────────────────────────────────────────
// Preferência do jogador pro app inteiro: [data-density] no <html> troca a
// altura de linha das tabelas e o respiro dos painéis (tokens.css).
export type Density = 'comfortable' | 'compact';
const DENSITY_KEY = 'rtm-density-v1';
const densityListeners = new Set<(d: Density) => void>();
let density: Density = (() => {
  try { return localStorage.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'comfortable'; } catch { return 'comfortable'; }
})();
function applyDensity(d: Density) {
  if (typeof document === 'undefined') return;
  if (d === 'compact') document.documentElement.dataset.density = 'compact';
  else delete document.documentElement.dataset.density;
}
applyDensity(density);

export function setDensity(d: Density) {
  density = d;
  try { localStorage.setItem(DENSITY_KEY, d); } catch { /* sem storage */ }
  applyDensity(d);
  densityListeners.forEach((fn) => fn(d));
}

export function useDensity(): [Density, () => void] {
  const [d, setD] = useState(density);
  useEffect(() => {
    densityListeners.add(setD);
    return () => { densityListeners.delete(setD); };
  }, []);
  return [d, () => setDensity(d === 'compact' ? 'comfortable' : 'compact')];
}

// ── paleta de comandos: abre de qualquer lugar (atalho, botão de busca) ─────
const paletteListeners = new Set<(open: boolean) => void>();
export function openPalette() { paletteListeners.forEach((fn) => fn(true)); }
export function usePaletteOpen(): [boolean, (v: boolean) => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    paletteListeners.add(setOpen);
    return () => { paletteListeners.delete(setOpen); };
  }, []);
  return [open, setOpen];
}
