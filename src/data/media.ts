import type { MapId, TeamSeason } from '../types';
import teamLogos from './team-logos.json';

const commonsFile = (file: string) => `https://liquipedia.net/commons/Special:FilePath/${encodeURIComponent(file)}`;

// logos resolvidos da Liquipedia (build-time), servidos via proxy Photon que
// aceita hotlink e redimensiona preservando o aspecto (a Liquipedia bloqueia
// hotlink direto, por isso algumas logos não carregavam).
const RESOLVED_LOGOS = teamLogos as Record<string, string>;
const photon = (path: string, w = 220) => `https://i0.wp.com/liquipedia.net${path}?w=${w}&ssl=1`;

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

const LOGO_FILES: Record<string, string> = {
  '3d2004': 'Team_3D_allmode.png',
  astralis2018: 'Astralis_allmode.png',
  big2020: 'BIG_allmode.png',
  c92018: 'Cloud9_allmode.png',
  col2005: 'Complexity_Gaming_allmode.png',
  eg2019: 'Evil_Geniuses_allmode.png',
  ence2019: 'ENCE_allmode.png',
  envyus2015: 'Team_EnVyUs_allmode.png',
  esc2012: 'ESC_Gaming_allmode.png',
  falcons2025: 'Team_Falcons_allmode.png',
  faze2018: 'FaZe_Clan_allmode.png',
  faze2022: 'FaZe_Clan_allmode.png',
  fnatic2009: 'Fnatic_allmode.png',
  fnatic2015: 'Fnatic_allmode.png',
  furia2022: 'FURIA_Esports_allmode.png',
  furia2025: 'FURIA_Esports_allmode.png',
  g22017: 'G2_Esports_allmode.png',
  g22023: 'G2_Esports_allmode.png',
  gambit2017: 'Gambit_Esports_allmode.png',
  gambit2021: 'Gambit_Esports_allmode.png',
  gamerlegion2023: 'GamerLegion_allmode.png',
  heroic2023: 'Heroic_allmode.png',
  imperial2022: 'Imperial_Esports_allmode.png',
  legacy2026: 'Legacy_allmode.png',
  liquid2019: 'Team_Liquid_allmode.png',
  mibr2006: 'MIBR_allmode.png',
  mongolz2025: 'The_MongolZ_allmode.png',
  mouz2019: 'MOUZ_allmode.png',
  mouz2024: 'MOUZ_allmode.png',
  mTw2008: 'MTw_allmode.png',
  mtw2008: 'MTw_allmode.png',
  navi2010: 'Natus_Vincere_allmode.png',
  navi2021: 'Natus_Vincere_allmode.png',
  navi2024: 'Natus_Vincere_allmode.png',
  nip2001: 'Ninjas_in_Pyjamas_allmode.png',
  nip2013: 'Ninjas_in_Pyjamas_allmode.png',
  og2020: 'OG_allmode.png',
  outsiders2022: 'Outsiders_allmode.png',
  pain2024: 'PaiN_Gaming_allmode.png',
  pentagram2007: 'Pentagram_G-Shock_allmode.png',
  renegades2019: 'Renegades_allmode.png',
  sk2003: 'SK_Gaming_allmode.png',
  sk2016: 'SK_Gaming_allmode.png',
  spirit2025: 'Team_Spirit_allmode.png',
  tsm2015: 'Team_SoloMid_allmode.png',
  tyloo2018: 'TYLOO_allmode.png',
  tyloo2025: 'TYLOO_allmode.png',
  verygames2012: 'VeryGames_allmode.png',
  vitality2019: 'Team_Vitality_allmode.png',
  vitality2025: 'Team_Vitality_allmode.png',
  vp2014: 'Virtus.pro_allmode.png',
  cphflames2021: 'Copenhagen_Flames_allmode.png',
  bne2022: 'Bad_News_Eagles_allmode.png',
  apeks2023: 'Apeks_allmode.png',
  monte2023: 'Monte_allmode.png',
  forze2019: 'ForZe_allmode.png',
  sprout2021: 'Sprout_allmode.png',
  '9z2022': '9z_Team_allmode.png',
  complexity2024: 'Complexity_Gaming_allmode.png',
  immortals2017: 'Immortals_allmode.png',
  mibr2019: 'MIBR_allmode.png',
  '00nation2022': '00_Nation_allmode.png',
  redcanids2022: 'RED_Canids_allmode.png',
  pain2021: 'PaiN_Gaming_allmode.png',
  fluxo2023: 'Fluxo_allmode.png',
  imperial2024: 'Imperial_Esports_allmode.png',
  intz2019: 'INTZ_allmode.png',
  sharks2019: 'Sharks_Esports_allmode.png',
  oddik2024: 'ODDIK_allmode.png',
  w7m2024: 'W7m_esports_allmode.png',
  case2023: 'Case_Esports_allmode.png',
};

// Logos locais (enviadas pelo usuário) - têm prioridade sobre a Liquipedia
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

export function logoForTeam(team: Pick<TeamSeason, 'id' | 'team'>): string {
  const local = LOCAL_LOGOS[team.id];
  if (local) return `/logos/${local}`;
  const resolved = RESOLVED_LOGOS[team.id];
  if (resolved) return photon(resolved);
  const byId = LOGO_FILES[team.id];
  if (byId) return commonsFile(byId);
  return commonsFile(`${team.team.replace(/[^A-Za-z0-9]+/g, '_')}_allmode.png`);
}

export function liquipediaTeamUrl(team: Pick<TeamSeason, 'team'>): string {
  return `https://liquipedia.net/counterstrike/${team.team.replace(/ /g, '_')}`;
}

// ---- fotos de jogadores (resolvidas em build-time da Liquipedia) ----
// Servidas via proxy Photon (i0.wp.com), que aceita hotlink e redimensiona;
// a Liquipedia bloqueia hotlink direto. Conteúdo CC-BY-SA da Liquipedia.
import playerPhotos from './player-photos.json';

const PHOTOS = playerPhotos as Record<string, string>;

export function photoForNick(nick: string, size = 120): string | undefined {
  const path = PHOTOS[nick.toLowerCase()];
  if (!path) return undefined;
  return `https://i0.wp.com/liquipedia.net${path}?resize=${size},${size}&ssl=1`;
}
