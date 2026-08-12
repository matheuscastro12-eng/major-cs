// DESAFIO DE FANTASMA — captura do link `?desafio=day-rating-nick` e guarda
// local até o desafiado jogar a Série do Dia. O param é lido UMA vez no boot
// (e removido da URL); a tela da Série consome via loadGhost(day).

import { parseGhostParam, type GhostChallenge } from '../engine/rtp/dailySeries';
import { track } from './track';

const KEY = 'rtm-ghost-v1';

// lê ?desafio= da URL corrente, persiste e limpa a URL. Chamar no boot do app.
export function captureGhostFromUrl(): void {
  try {
    const url = new URL(window.location.href);
    const g = parseGhostParam(url.searchParams.get('desafio'));
    if (!g) return;
    localStorage.setItem(KEY, JSON.stringify(g));
    track('ghost_open', { day: g.day, rating: g.rating });
    url.searchParams.delete('desafio');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch { /* sem URL/storage — segue sem desafio */ }
}

// o desafio pendente PRO DIA — desafio de dia passado expira (e é limpo).
export function loadGhost(day: number): GhostChallenge | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const g = JSON.parse(raw) as GhostChallenge;
    if (!g || g.day !== day) { localStorage.removeItem(KEY); return null; }
    return parseGhostParam(`${g.day}-${Math.round(g.rating * 100)}-${g.nick}`);
  } catch { return null; }
}

export function clearGhost(): void {
  try { localStorage.removeItem(KEY); } catch { /* sem storage */ }
}
