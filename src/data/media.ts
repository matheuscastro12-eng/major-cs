import type { MapId, TeamSeason } from '../types';

// Logos de times: SÓ as locais (public/logos). Não usamos mais logos da Liquipedia nem o
// proxy Photon (i0.wp.com). Sem logo local → TeamBadge mostra a sigla do time.

/** URL que vem da Liquipedia (ou do proxy i0.wp.com): saves antigos podem ter guardado uma. */
export const isLiquipediaLogo = (url: string | undefined): boolean => !!url && /liquipedia\.net|i0\.wp\.com/i.test(url);

// fotos locais enviadas pelo usuário (uploads no CRM ainda têm prioridade)
export const MAP_IMAGES: Record<MapId, string> = {
  mirage: '/maps/mirage.jpg',
  inferno: '/maps/inferno.webp',
  nuke: '/maps/nuke.jpg',
  ancient: '/maps/ancient.jpg',
  anubis: '/maps/anubis.jpg',
  dust2: '/maps/dust2.jpg',
  train: '/maps/train.jpg',
};

// Logos locais (enviadas pelo usuário)
const LOCAL_LOGOS: Record<string, string> = {
  '00nation2022': '00nation.png',
  '9z2022': '9z.png',
  astralis2018: 'astralis.png',
  big2020: 'big.jpg',
  c92018: 'cloud9.png',
  col2005: 'complexity.png',
  complexity2024: 'complexity.png',
  esc2012: 'esc.png',
  eg2019: 'eg.png',
  apeks2023: 'apeks.png',
  bne2022: 'bne.png',
  case2023: 'case.png',
  cphflames2021: 'cph.jpg',
  ence2019: 'ence.png',
  imperial2022: 'imperial.png',
  imperial2024: 'imperial.png',
  liquid2019: 'liquid.png',
  nip2001: 'nip.jpg',
  nip2013: 'nip.jpg',
  intz2019: 'intz.png',
  falcons2025: 'falcons.png',
  faze2018: 'faze.png',
  faze2022: 'faze.png',
  fnatic2009: 'fnatic.png',
  fnatic2015: 'fnatic.png',
  furia2022: 'furia.png',
  furia2025: 'furia.png',
  g22017: 'g2.png',
  g22023: 'g2.png',
  gambit2017: 'gambit.jpg',
  gambit2021: 'gambit.jpg',
  heroic2023: 'heroic.png',
  immortals2017: 'immortals.jpg',
  legacy2026: 'legacy.png',
  mibr2019: 'mibr.png',
  mibr2006: 'mibr2006.png',
  monte2023: 'monte.png',
  mouz2019: 'mousesports.png',
  mouz2024: 'mouz.png',
  mtw2008: 'mtw.png',
  navi2010: 'navi.png',
  navi2021: 'navi.png',
  navi2024: 'navi.png',
  oddik2024: 'oddik.png',
  pain2021: 'pain.png',
  pain2024: 'pain.png',
  pentagram2007: 'pentagram.jpg',
  redcanids2022: 'redcanids.png',
  renegades2019: 'renegades.png',
  sharks2019: 'sharks.png',
  sk2003: 'skgaming.jpg',
  sk2016: 'skgaming.jpg',
  spirit2025: 'spirit.png',
  sprout2021: 'sprout.png',
  '3d2004': 'team3d.png',
  mongolz2025: 'mongolz.png',
  tsm2015: 'tsm.png',
  tyloo2018: 'tyloo.png',
  tyloo2025: 'tyloo.png',
  verygames2012: 'verygames.png',
  vp2014: 'virtuspro.png',
  vitality2019: 'vitality.png',
  vitality2025: 'vitality.png',
  w7m2024: 'w7m.png',
};

export function logoForTeam(team: Pick<TeamSeason, 'id' | 'team'>): string | undefined {
  const local = LOCAL_LOGOS[team.id];
  return local ? `/logos/${local}` : undefined;
}

// Logo local pelo NOME/sigla do time (times fora do banco de temporadas, ex.: os
// convidados do Modo Major e os seeds do Major da carreira). Só arquivos de
// public/logos — nunca Liquipedia. Sem arquivo → undefined (TeamBadge usa a sigla).
const LOGO_BY_NAME: Record<string, string> = {
  vitality: 'vitality.png',
  spirit: 'spirit.png',
  falcons: 'falcons.png',
  natusvincere: 'navi.png', navi: 'navi.png',
  mouz: 'mouz.png', mousesports: 'mouz.png',
  legacy: 'legacy.png',
  mongolz: 'mongolz.png',
  astralis: 'astralis.png',
  furia: 'furia.png',
  g2: 'g2.png',
  '9z': '9z.png',
  pain: 'pain.png',
  mibr: 'mibr.png',
  faze: 'faze.png',
  ninjasinpyjamas: 'nip.jpg', nip: 'nip.jpg',
  heroic: 'heroic.png',
  big: 'big.jpg',
  tyloo: 'tyloo.png',
  liquid: 'liquid.png',
  fnatic: 'fnatic.png', cloud9: 'cloud9.png', ence: 'ence.png',
  complexity: 'complexity.png', imperial: 'imperial.png',
  apeks: 'apeks.png', sharks: 'sharks.png', redcanids: 'redcanids.png', oddik: 'oddik.png',
  w7m: 'w7m.png', virtuspro: 'virtuspro.png',
};
const normTeam = (s: string) => s.toLowerCase()
  .replace(/\b(team|esports|e-sports|gaming|clan|club)\b/g, '')
  .replace(/^the\s+/, '')
  .replace(/[^a-z0-9]/g, '');

/** logo local para um time pelo nome, sigla ou id (o primeiro que bater) */
export function logoForName(...keys: (string | undefined)[]): string | undefined {
  for (const k of keys) {
    if (!k) continue;
    const f = LOGO_BY_NAME[normTeam(k)];
    if (f) return `/logos/${f}`;
  }
  return undefined;
}

export function liquipediaTeamUrl(team: Pick<TeamSeason, 'team'>): string {
  return `https://liquipedia.net/counterstrike/${team.team.replace(/ /g, '_')}`;
}

// ---- fotos de jogadores ----
// Só bo3.gg, servidas do NOSSO domínio (public/players/bo3/<slug>.webp, commitadas;
// sem hotlink pro CDN). bo3-photos.json lista só as que existem em disco; as
// quebradas ficam em bo3-photos-missing.json. Atualizar: tsx scripts/fetch-bo3-photos.mts.
// NÃO usamos fotos da Liquipedia (licença "permission", uso restrito à Liquipedia).
// Sem foto → PlayerAvatar mostra as iniciais. Crédito "Fotos: bo3.gg" é global (GameShell).
import bo3Photos from './bo3-photos.json';

export const photoSlug = (nick: string) => nick.toLowerCase().replace(/[^a-z0-9_-]/g, '');
const BO3_LOCAL = new Set(Object.keys(bo3Photos as Record<string, string>).map(photoSlug));

export function photoForNick(nick: string): string | undefined {
  const k = photoSlug(nick);
  return k && BO3_LOCAL.has(k) ? `/players/bo3/${k}.webp` : undefined;
}

