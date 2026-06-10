import type { MapId, TeamSeason } from '../types';

const commonsFile = (file: string) => `https://liquipedia.net/commons/Special:FilePath/${encodeURIComponent(file)}`;
const counterstrikeFile = (file: string) => `https://liquipedia.net/counterstrike/Special:FilePath/${encodeURIComponent(file)}`;

export const MAP_IMAGES: Record<MapId, string> = {
  mirage: counterstrikeFile('Mirage_cs2.png'),
  inferno: counterstrikeFile('Inferno_cs2.png'),
  nuke: counterstrikeFile('Nuke_cs2.png'),
  ancient: counterstrikeFile('Ancient_cs2.png'),
  anubis: counterstrikeFile('Anubis_cs2.png'),
  dust2: counterstrikeFile('Dust2_cs2.png'),
  train: counterstrikeFile('Train_cs2.png'),
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

export function logoForTeam(team: Pick<TeamSeason, 'id' | 'team'>): string {
  const byId = LOGO_FILES[team.id];
  if (byId) return commonsFile(byId);
  return commonsFile(`${team.team.replace(/[^A-Za-z0-9]+/g, '_')}_allmode.png`);
}

export function liquipediaTeamUrl(team: Pick<TeamSeason, 'team'>): string {
  return `https://liquipedia.net/counterstrike/${team.team.replace(/ /g, '_')}`;
}
