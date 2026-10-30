// Abas do Modo Major. Moram fora da tela (que carrega sob demanda) porque o
// App monta com elas o menu do shell: o painel lateral no desktop e a tab bar
// no celular. A tela recebe a aba pelo App e não desenha abas próprias.
export type MajorTab = 'overview' | 'play' | 'pickem' | 'league' | 'sim';
export const MAJOR_TABS: readonly MajorTab[] = ['overview', 'play', 'pickem', 'league', 'sim'];

export function hasLeagueParam(): boolean {
  try { return new URLSearchParams(window.location.search).has('liga'); } catch { return false; }
}

/** aba de entrada: link de palpite (?p=) abre o pick'em; convite de liga (?liga=), a liga */
export function initialMajorTab(): MajorTab {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get('p')) return 'pickem';
    if (q.has('liga')) return 'league';
  } catch { /* sem window */ }
  return 'overview';
}
