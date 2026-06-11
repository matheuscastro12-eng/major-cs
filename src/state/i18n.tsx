// i18n leve, sem dependências. Português é o idioma principal (fallback);
// inglês e espanhol cobrem a home e a navegação para alcançar o público
// internacional. Use o hook useLang() para ler o idioma e traduzir com t().
import { useEffect, useReducer } from 'react';

export type Lang = 'pt' | 'en' | 'es';
export const LANGS: { code: Lang; label: string; flag: string }[] = [
  { code: 'pt', label: 'PT', flag: '🇧🇷' },
  { code: 'en', label: 'EN', flag: '🇺🇸' },
  { code: 'es', label: 'ES', flag: '🇪🇸' },
];

const KEY = 'rtm-lang-v1';
const read = (): Lang => {
  try {
    const v = localStorage.getItem(KEY) as Lang | null;
    if (v === 'pt' || v === 'en' || v === 'es') return v;
  } catch {
    /* sem storage */
  }
  return 'pt';
};

let current: Lang = read();
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return current;
}
export function setLang(l: Lang): void {
  current = l;
  try {
    localStorage.setItem(KEY, l);
    document.documentElement.lang = l === 'pt' ? 'pt-BR' : l;
  } catch {
    /* sem storage */
  }
  listeners.forEach((f) => f());
}

type Dict = Record<string, string>;

const PT: Dict = {
  'hero.tagline':
    'Monte o time dos sonhos com lendas de todas as eras do Counter-Strike (do 1.6 ao CS2) e dispute um Major completo em séries MD3 contra os maiores times da história.',
  'home.resume': '▶ Continuar campanha',
  'home.ended': '(encerrada)',
  'home.newCampaign': '🗑 Nova campanha',
  'home.confirmDiscard': 'Apagar a campanha salva e começar um novo jogo?',
  'home.online': '🌐 Jogar online com amigos (duelo 1x1 ou grupo)',
  'home.poolWorld': '🏆 Major Mundial',
  'home.poolWorldDesc': 'Todas as eras e regiões: do 1.6 ao CS2, monte o dream team global e vença o Major dos Sonhos.',
  'home.poolBr': '🇧🇷 GC Masters',
  'home.poolBrDesc': 'Só elencos brasileiros: de mibr 2006 e SK 2016 a Legacy e FURIA. O campeonato da pátria de chuteiras (e de headshot).',
  'home.modeClassic': '🎯 Modo Clássico',
  'home.modeClassicDesc': 'Os atributos de cada jogador ficam visíveis no draft. Monte o time com base nos dados.',
  'home.modeAlmanac': '📕 Modo Almanaque',
  'home.modeAlmanacDesc': 'Atributos escondidos. Só o seu conhecimento da história do CS define as escolhas.',
  'home.namePlaceholder': 'Nome do seu time…',
  'home.start': 'Começar draft',
  'home.teams': 'elencos históricos',
  'home.players': 'jogadores',
  'home.hall': '🏛 Hall da Fama',
  'home.curated': 'dados curados com base em',
  'home.photos': 'fotos de jogadores:',
  'diff.normal': 'Normal',
  'diff.normalDesc': 'Campo equilibrado. Bom para aprender o jogo.',
  'diff.hard': 'Difícil',
  'diff.hardDesc': 'Adversários afiados e campo mais forte. Cada veto conta.',
  'diff.legend': 'Lendário',
  'diff.legendDesc': 'As maiores lendas em chamas. Vencer aqui é épico.',
  'nav.hall': '🏛 Hall',
  'nav.subtitle': 'simulador do cenário profissional de Counter-Strike · do 1.6 ao CS2',
  'social.follow': 'Siga no 𝕏',
  'social.announcement': 'O anúncio do jogo:',
};

const EN: Dict = {
  'hero.tagline':
    'Build your dream team with legends from every Counter-Strike era (1.6 to CS2) and play a full Major in best-of-3 series against the greatest teams in history.',
  'home.resume': '▶ Resume campaign',
  'home.ended': '(finished)',
  'home.newCampaign': '🗑 New campaign',
  'home.confirmDiscard': 'Delete the saved campaign and start a new game?',
  'home.online': '🌐 Play online with friends (1v1 duel or group)',
  'home.poolWorld': '🏆 World Major',
  'home.poolWorldDesc': 'All eras and regions: from 1.6 to CS2, build the global dream team and win the Major of Dreams.',
  'home.poolBr': '🇧🇷 GC Masters',
  'home.poolBrDesc': 'Brazilian rosters only: from mibr 2006 and SK 2016 to Legacy and FURIA. The homeland championship.',
  'home.modeClassic': '🎯 Classic Mode',
  'home.modeClassicDesc': 'Every player’s stats are visible during the draft. Build your team from the data.',
  'home.modeAlmanac': '📕 Almanac Mode',
  'home.modeAlmanacDesc': 'Stats hidden. Only your knowledge of CS history guides your picks.',
  'home.namePlaceholder': 'Your team name…',
  'home.start': 'Start draft',
  'home.teams': 'historic rosters',
  'home.players': 'players',
  'home.hall': '🏛 Hall of Fame',
  'home.curated': 'data curated from',
  'home.photos': 'player photos:',
  'diff.normal': 'Normal',
  'diff.normalDesc': 'Balanced field. Great to learn the game.',
  'diff.hard': 'Hard',
  'diff.hardDesc': 'Sharp opponents and a tougher field. Every veto counts.',
  'diff.legend': 'Legendary',
  'diff.legendDesc': 'The greatest legends on fire. Winning here is epic.',
  'nav.hall': '🏛 Hall',
  'nav.subtitle': 'professional Counter-Strike scene simulator · from 1.6 to CS2',
  'social.follow': 'Follow on 𝕏',
  'social.announcement': 'The game announcement:',
};

const ES: Dict = {
  'hero.tagline':
    'Arma el equipo de tus sueños con leyendas de todas las eras de Counter-Strike (del 1.6 al CS2) y disputa un Major completo en series al mejor de 3 contra los mejores equipos de la historia.',
  'home.resume': '▶ Continuar campaña',
  'home.ended': '(finalizada)',
  'home.newCampaign': '🗑 Nueva campaña',
  'home.confirmDiscard': '¿Borrar la campaña guardada y empezar una nueva partida?',
  'home.online': '🌐 Juega online con amigos (duelo 1v1 o grupo)',
  'home.poolWorld': '🏆 Major Mundial',
  'home.poolWorldDesc': 'Todas las eras y regiones: del 1.6 al CS2, arma el dream team global y gana el Major de los Sueños.',
  'home.poolBr': '🇧🇷 GC Masters',
  'home.poolBrDesc': 'Solo plantillas brasileñas: de mibr 2006 y SK 2016 a Legacy y FURIA. El campeonato de la patria.',
  'home.modeClassic': '🎯 Modo Clásico',
  'home.modeClassicDesc': 'Los atributos de cada jugador son visibles en el draft. Arma el equipo con los datos.',
  'home.modeAlmanac': '📕 Modo Almanaque',
  'home.modeAlmanacDesc': 'Atributos ocultos. Solo tu conocimiento de la historia de CS guía tus elecciones.',
  'home.namePlaceholder': 'Nombre de tu equipo…',
  'home.start': 'Empezar draft',
  'home.teams': 'plantillas históricas',
  'home.players': 'jugadores',
  'home.hall': '🏛 Salón de la Fama',
  'home.curated': 'datos curados a partir de',
  'home.photos': 'fotos de jugadores:',
  'diff.normal': 'Normal',
  'diff.normalDesc': 'Campo equilibrado. Bueno para aprender el juego.',
  'diff.hard': 'Difícil',
  'diff.hardDesc': 'Rivales afilados y un campo más fuerte. Cada veto cuenta.',
  'diff.legend': 'Legendario',
  'diff.legendDesc': 'Las mayores leyendas en llamas. Ganar aquí es épico.',
  'nav.hall': '🏛 Salón',
  'nav.subtitle': 'simulador de la escena profesional de Counter-Strike · del 1.6 al CS2',
  'social.follow': 'Sígueme en 𝕏',
  'social.announcement': 'El anuncio del juego:',
};

const DICT: Record<Lang, Dict> = { pt: PT, en: EN, es: ES };

export function useLang(): { lang: Lang; setLang: (l: Lang) => void; t: (k: string) => string } {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => {
      listeners.delete(force);
    };
  }, []);
  const t = (k: string): string => DICT[current][k] ?? PT[k] ?? k;
  return { lang: current, setLang, t };
}
