/** Rota de perfil de jogador dentro do modo carreira: /carreira/jogador/:id */

const ROUTE_PREFIX = 'user__';

/** Id estável no save (contratos, moral, evo…) — sem prefixo de runtime. */
export function playerOrgId(id: string): string {
  return id.replace(/^user__/, '');
}

/** Id usado na URL e no time em partida (prefixo user__). */
export function playerRuntimeId(id: string): string {
  const base = playerOrgId(id);
  return `${ROUTE_PREFIX}${base}`;
}

export function parseCareerPlayerId(pathname = window.location.pathname): string | null {
  const m = pathname.match(/^\/carreira\/jogador\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

export function careerPlayerPath(playerId: string): string {
  return `/carreira/jogador/${encodeURIComponent(playerId)}`;
}

export function navigateCareerPlayer(playerId: string): void {
  window.history.pushState({ screen: 'career', careerPlayer: playerId }, '', careerPlayerPath(playerId));
}

export function closeCareerPlayerRoute(): void {
  window.history.pushState({ screen: 'career' }, '', '/carreira');
}

export function isCareerPlayerPath(pathname = window.location.pathname): boolean {
  return /^\/carreira\/jogador\//i.test(pathname);
}
