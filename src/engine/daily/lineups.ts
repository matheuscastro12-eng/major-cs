// DIÁRIO — dataset das LINES HISTÓRICAS: escalações icônicas do CS competitivo
// (CS:GO e CS2) pro minigame "lembre os 5". Puro, sem React.
//
// Curadoria: só lineups FAMOSAS e sem ambiguidade de quinto jogador (nada de
// era com stand-in no meio). O contexto é a dica principal; role+país são as
// dicas por slot. Viés BR proposital — é a nossa audiência.
//
// `aliases` cobre como as pessoas realmente digitam (sem stylization: getright,
// pasha, cold). O matching normaliza (minúsculas, sem acento/pontuação), então
// aliases só precisam cobrir variações de LETRAS/números, não de caixa.

export type LineRole = 'IGL' | 'AWP' | 'Rifler' | 'Entry' | 'Support' | 'Lurker' | 'Coach';

export interface LinePlayer {
  nick: string;               // grafia canônica (exibida ao revelar)
  aliases?: string[];         // variações aceitas além do nick normalizado
  country: string;            // ISO-3166 alpha-2 minúsculo (vira bandeira na UI)
  role: LineRole;             // dica do slot
}

export interface HistoricLine {
  id: string;                 // estável — vai pro share e pro localStorage
  team: string;
  year: number;
  context: string;            // a manchete que situa a line (PT-BR, tom de caster)
  players: LinePlayer[];      // SEMPRE 5, ordem: IGL/estrela primeiro é irrelevante — a UI embaralha por dia
}

export const HISTORIC_LINES: HistoricLine[] = [
  {
    id: 'lg-2016', team: 'Luminosity Gaming', year: 2016,
    context: 'O primeiro Major do Brasil — campeões da MLG Columbus 2016.',
    players: [
      { nick: 'FalleN', aliases: ['fallen', 'gabriel toledo'], country: 'br', role: 'AWP' },
      { nick: 'coldzera', aliases: ['cold', 'marcelo david'], country: 'br', role: 'Rifler' },
      { nick: 'fer', aliases: ['fernando alvarenga'], country: 'br', role: 'Entry' },
      { nick: 'fnx', aliases: ['lincoln lau'], country: 'br', role: 'Support' },
      { nick: 'TACO', aliases: ['taco', 'epitacio'], country: 'br', role: 'Support' },
    ],
  },
  {
    id: 'sk-2016', team: 'SK Gaming', year: 2016,
    context: 'Back-to-back: o bicampeonato de Major na ESL One Cologne 2016.',
    players: [
      { nick: 'FalleN', aliases: ['fallen'], country: 'br', role: 'AWP' },
      { nick: 'coldzera', aliases: ['cold'], country: 'br', role: 'Rifler' },
      { nick: 'fer', country: 'br', role: 'Entry' },
      { nick: 'fnx', country: 'br', role: 'Support' },
      { nick: 'TACO', aliases: ['taco'], country: 'br', role: 'Support' },
    ],
  },
  {
    id: 'sk-2017', team: 'SK Gaming', year: 2017,
    context: 'O melhor time do mundo de 2017 — a era felps, dona da ESL One Cologne.',
    players: [
      { nick: 'FalleN', aliases: ['fallen'], country: 'br', role: 'AWP' },
      { nick: 'coldzera', aliases: ['cold'], country: 'br', role: 'Rifler' },
      { nick: 'fer', country: 'br', role: 'Entry' },
      { nick: 'felps', country: 'br', role: 'Entry' },
      { nick: 'TACO', aliases: ['taco'], country: 'br', role: 'Support' },
    ],
  },
  {
    id: 'mibr-2018', team: 'MIBR', year: 2018,
    context: 'A volta da sigla lendária — com dois gringos no meio dos brasileiros.',
    players: [
      { nick: 'FalleN', aliases: ['fallen'], country: 'br', role: 'AWP' },
      { nick: 'coldzera', aliases: ['cold'], country: 'br', role: 'Rifler' },
      { nick: 'fer', country: 'br', role: 'Entry' },
      { nick: 'Stewie2K', aliases: ['stewie', 'stewie2k'], country: 'us', role: 'Entry' },
      { nick: 'tarik', country: 'us', role: 'Rifler' },
    ],
  },
  {
    id: 'imperial-2022', team: 'Imperial', year: 2022,
    context: 'A last dance: os veteranos do bi de Major juntos de novo, rumo ao Major do Rio.',
    players: [
      { nick: 'FalleN', aliases: ['fallen'], country: 'br', role: 'AWP' },
      { nick: 'fer', country: 'br', role: 'Rifler' },
      { nick: 'fnx', country: 'br', role: 'Support' },
      { nick: 'boltz', country: 'br', role: 'Rifler' },
      { nick: 'VINI', aliases: ['vini'], country: 'br', role: 'Support' },
    ],
  },
  {
    id: 'furia-2022', team: 'FURIA', year: 2022,
    context: 'A semifinal histórica no Major do Rio, com a torcida inteira do lado deles.',
    players: [
      { nick: 'arT', aliases: ['art'], country: 'br', role: 'IGL' },
      { nick: 'yuurih', country: 'br', role: 'Rifler' },
      { nick: 'KSCERATO', aliases: ['kscerato'], country: 'br', role: 'Rifler' },
      { nick: 'drop', country: 'br', role: 'Support' },
      { nick: 'saffee', country: 'br', role: 'AWP' },
    ],
  },
  {
    id: 'immortals-2017', team: 'Immortals', year: 2017,
    context: 'Os moleques que chegaram na final do Major de Krakow 2017.',
    players: [
      { nick: 'kNgV-', aliases: ['kng', 'kngv'], country: 'br', role: 'AWP' },
      { nick: 'HEN1', aliases: ['hen1', 'henrique'], country: 'br', role: 'AWP' },
      { nick: 'LUCAS1', aliases: ['lucas1'], country: 'br', role: 'Rifler' },
      { nick: 'steel', country: 'br', role: 'Support' },
      { nick: 'boltz', country: 'br', role: 'Rifler' },
    ],
  },
  {
    id: 'nip-2013', team: 'Ninjas in Pyjamas', year: 2013,
    context: 'O 87-0 em LAN — o time mais dominante que o CS:GO já viu.',
    players: [
      { nick: 'f0rest', aliases: ['forest'], country: 'se', role: 'Rifler' },
      { nick: 'GeT_RiGhT', aliases: ['getright', 'get right'], country: 'se', role: 'Lurker' },
      { nick: 'friberg', country: 'se', role: 'Entry' },
      { nick: 'Xizt', aliases: ['xizt'], country: 'se', role: 'IGL' },
      { nick: 'Fifflaren', aliases: ['fifflaren'], country: 'se', role: 'AWP' },
    ],
  },
  {
    id: 'fnatic-2015', team: 'Fnatic', year: 2015,
    context: 'O bi de Major (Katowice + Cologne 2015) — pra muitos, o maior time da história.',
    players: [
      { nick: 'olofmeister', aliases: ['olof'], country: 'se', role: 'Rifler' },
      { nick: 'JW', aliases: ['jw'], country: 'se', role: 'AWP' },
      { nick: 'flusha', country: 'se', role: 'Lurker' },
      { nick: 'KRIMZ', aliases: ['krimz'], country: 'se', role: 'Support' },
      { nick: 'pronax', country: 'se', role: 'IGL' },
    ],
  },
  {
    id: 'vp-2014', team: 'Virtus.pro', year: 2014,
    context: 'O Golden Five polonês campeão da EMS One Katowice 2014.',
    players: [
      { nick: 'TaZ', aliases: ['taz'], country: 'pl', role: 'IGL' },
      { nick: 'NEO', aliases: ['neo'], country: 'pl', role: 'Rifler' },
      { nick: 'pashaBiceps', aliases: ['pasha', 'pashabiceps'], country: 'pl', role: 'Entry' },
      { nick: 'Snax', aliases: ['snax'], country: 'pl', role: 'Lurker' },
      { nick: 'byali', country: 'pl', role: 'Rifler' },
    ],
  },
  {
    id: 'envyus-2015', team: 'EnVyUs', year: 2015,
    context: 'Os franceses campeões do Major de Cluj-Napoca 2015.',
    players: [
      { nick: 'kennyS', aliases: ['kennys', 'kenny'], country: 'fr', role: 'AWP' },
      { nick: 'apEX', aliases: ['apex'], country: 'fr', role: 'Entry' },
      { nick: 'Happy', aliases: ['happy'], country: 'fr', role: 'IGL' },
      { nick: 'NBK-', aliases: ['nbk'], country: 'fr', role: 'Support' },
      { nick: 'kioShiMa', aliases: ['kioshima', 'kio'], country: 'fr', role: 'Rifler' },
    ],
  },
  {
    id: 'gambit-2017', team: 'Gambit Esports', year: 2017,
    context: 'A zebra que calou Krakow — campeões do PGL Major 2017.',
    players: [
      { nick: 'Zeus', aliases: ['zeus'], country: 'ua', role: 'IGL' },
      { nick: 'AdreN', aliases: ['adren'], country: 'kz', role: 'Rifler' },
      { nick: 'HObbit', aliases: ['hobbit'], country: 'kz', role: 'Rifler' },
      { nick: 'mou', country: 'kz', role: 'AWP' },
      { nick: 'Dosia', aliases: ['dosia'], country: 'ru', role: 'Support' },
    ],
  },
  {
    id: 'c9-2018', team: 'Cloud9', year: 2018,
    context: 'O milagre de Boston — o primeiro (e único) Major da América do Norte.',
    players: [
      { nick: 'Stewie2K', aliases: ['stewie', 'stewie2k'], country: 'us', role: 'Entry' },
      { nick: 'tarik', country: 'us', role: 'IGL' },
      { nick: 'autimatic', aliases: ['automatic'], country: 'us', role: 'Rifler' },
      { nick: 'RUSH', aliases: ['rush'], country: 'us', role: 'Support' },
      { nick: 'Skadoodle', aliases: ['skadoodle', 'ska'], country: 'us', role: 'AWP' },
    ],
  },
  {
    id: 'faze-2018', team: 'FaZe Clan', year: 2018,
    context: 'O super-time internacional que perdeu Boston no overtime — e o mundo chorou com o GuardiaN.',
    players: [
      { nick: 'karrigan', country: 'dk', role: 'IGL' },
      { nick: 'NiKo', aliases: ['niko'], country: 'ba', role: 'Rifler' },
      { nick: 'olofmeister', aliases: ['olof'], country: 'se', role: 'Rifler' },
      { nick: 'GuardiaN', aliases: ['guardian'], country: 'sk', role: 'AWP' },
      { nick: 'rain', country: 'no', role: 'Entry' },
    ],
  },
  {
    id: 'astralis-2018', team: 'Astralis', year: 2018,
    context: 'A era mais dominante da história começa aqui — campeões do FACEIT Major de Londres.',
    players: [
      { nick: 'device', aliases: ['dev1ce', 'devve'], country: 'dk', role: 'AWP' },
      { nick: 'dupreeh', country: 'dk', role: 'Entry' },
      { nick: 'Xyp9x', aliases: ['xyp9x', 'xyp'], country: 'dk', role: 'Support' },
      { nick: 'gla1ve', aliases: ['glaive'], country: 'dk', role: 'IGL' },
      { nick: 'Magisk', aliases: ['magisk'], country: 'dk', role: 'Rifler' },
    ],
  },
  {
    id: 'liquid-2019', team: 'Team Liquid', year: 2019,
    context: 'O Grand Slam mais rápido da história — 4 títulos em 63 dias.',
    players: [
      { nick: 'EliGE', aliases: ['elige'], country: 'us', role: 'Rifler' },
      { nick: 'NAF', aliases: ['naf'], country: 'ca', role: 'Lurker' },
      { nick: 'Twistzz', aliases: ['twistzz', 'twist'], country: 'ca', role: 'Rifler' },
      { nick: 'nitr0', aliases: ['nitro'], country: 'us', role: 'IGL' },
      { nick: 'Stewie2K', aliases: ['stewie', 'stewie2k'], country: 'us', role: 'Entry' },
    ],
  },
  {
    id: 'navi-2018', team: 'Natus Vincere', year: 2018,
    context: 'O s1mple mais assustador de todos os tempos — e ainda assim não deu Major.',
    players: [
      { nick: 's1mple', aliases: ['simple'], country: 'ua', role: 'AWP' },
      { nick: 'electroNic', aliases: ['electronic'], country: 'ru', role: 'Rifler' },
      { nick: 'Zeus', aliases: ['zeus'], country: 'ua', role: 'IGL' },
      { nick: 'flamie', country: 'ru', role: 'Rifler' },
      { nick: 'Edward', aliases: ['edward'], country: 'ua', role: 'Support' },
    ],
  },
  {
    id: 'ence-2019', team: 'ENCE', year: 2019,
    context: '#EZ4ENCE — a zebra finlandesa que chegou na final de Katowice 2019.',
    players: [
      { nick: 'allu', country: 'fi', role: 'AWP' },
      { nick: 'aerial', aliases: ['aerial'], country: 'fi', role: 'Rifler' },
      { nick: 'xseveN', aliases: ['xseven'], country: 'fi', role: 'Support' },
      { nick: 'sergej', country: 'fi', role: 'Rifler' },
      { nick: 'Aleksib', aliases: ['aleksib'], country: 'fi', role: 'IGL' },
    ],
  },
  {
    id: 'big-2020', team: 'BIG', year: 2020,
    context: 'Os alemães que terminaram 2020 como #1 do mundo na era online.',
    players: [
      { nick: 'tabseN', aliases: ['tabsen'], country: 'de', role: 'IGL' },
      { nick: 'XANTARES', aliases: ['xantares'], country: 'tr', role: 'Rifler' },
      { nick: 'tiziaN', aliases: ['tizian'], country: 'de', role: 'Support' },
      { nick: 'syrsoN', aliases: ['syrson'], country: 'de', role: 'AWP' },
      { nick: 'k1to', aliases: ['kito'], country: 'de', role: 'Rifler' },
    ],
  },
  {
    id: 'gambit-2021', team: 'Gambit', year: 2021,
    context: 'Os moleques que dominaram a era online de 2021 antes de virarem Cloud9.',
    players: [
      { nick: 'sh1ro', aliases: ['shiro'], country: 'ru', role: 'AWP' },
      { nick: 'Ax1Le', aliases: ['axile', 'ax1le'], country: 'ru', role: 'Rifler' },
      { nick: 'Hobbit', aliases: ['hobbit'], country: 'kz', role: 'Rifler' },
      { nick: 'interz', country: 'ru', role: 'Support' },
      { nick: 'nafany', country: 'ru', role: 'IGL' },
    ],
  },
  {
    id: 'navi-2021', team: 'Natus Vincere', year: 2021,
    context: 'O Major de Estocolmo SEM PERDER UM MAPA — o auge do s1mple.',
    players: [
      { nick: 's1mple', aliases: ['simple'], country: 'ua', role: 'AWP' },
      { nick: 'electroNic', aliases: ['electronic'], country: 'ru', role: 'Rifler' },
      { nick: 'b1t', aliases: ['bit', 'b1t'], country: 'ua', role: 'Rifler' },
      { nick: 'Perfecto', aliases: ['perfecto'], country: 'ru', role: 'Support' },
      { nick: 'Boombl4', aliases: ['boombla', 'boombl4'], country: 'ru', role: 'IGL' },
    ],
  },
  {
    id: 'faze-2022', team: 'FaZe Clan', year: 2022,
    context: 'A vingança do karrigan: campeões do Major de Antuérpia 2022.',
    players: [
      { nick: 'karrigan', country: 'dk', role: 'IGL' },
      { nick: 'rain', country: 'no', role: 'Entry' },
      { nick: 'Twistzz', aliases: ['twistzz', 'twist'], country: 'ca', role: 'Rifler' },
      { nick: 'broky', country: 'lv', role: 'AWP' },
      { nick: 'ropz', country: 'ee', role: 'Lurker' },
    ],
  },
  {
    id: 'heroic-2023', team: 'Heroic', year: 2023,
    context: 'O time dinamarquês que viveu no top 3 do mundo em 2023.',
    players: [
      { nick: 'cadiaN', aliases: ['cadian'], country: 'dk', role: 'IGL' },
      { nick: 'TeSeS', aliases: ['teses'], country: 'dk', role: 'Rifler' },
      { nick: 'stavn', country: 'dk', role: 'Rifler' },
      { nick: 'jabbi', country: 'dk', role: 'Entry' },
      { nick: 'sjuush', country: 'dk', role: 'Support' },
    ],
  },
  {
    id: 'vitality-2023', team: 'Team Vitality', year: 2023,
    context: 'O ZywOo campeão em casa — Major de Paris 2023, o último do CS:GO.',
    players: [
      { nick: 'ZywOo', aliases: ['zywoo'], country: 'fr', role: 'AWP' },
      { nick: 'apEX', aliases: ['apex'], country: 'fr', role: 'IGL' },
      { nick: 'dupreeh', country: 'dk', role: 'Entry' },
      { nick: 'Magisk', aliases: ['magisk'], country: 'dk', role: 'Rifler' },
      { nick: 'Spinx', aliases: ['spinx'], country: 'il', role: 'Rifler' },
    ],
  },
  {
    id: 'g2-2023', team: 'G2 Esports', year: 2023,
    context: 'O time do m0NESY de 17 anos que atropelou a IEM Katowice 2023.',
    players: [
      { nick: 'NiKo', aliases: ['niko'], country: 'ba', role: 'Rifler' },
      { nick: 'huNter-', aliases: ['hunter'], country: 'ba', role: 'Rifler' },
      { nick: 'm0NESY', aliases: ['monesy'], country: 'ru', role: 'AWP' },
      { nick: 'HooXi', aliases: ['hooxi'], country: 'dk', role: 'IGL' },
      { nick: 'jks', country: 'au', role: 'Lurker' },
    ],
  },
  {
    id: 'spirit-2024', team: 'Team Spirit', year: 2024,
    context: 'O ano do donk — campeões do Major de Xangai 2024 com o prodígio em outro nível.',
    players: [
      { nick: 'donk', country: 'ru', role: 'Entry' },
      { nick: 'sh1ro', aliases: ['shiro'], country: 'ru', role: 'AWP' },
      { nick: 'zont1x', aliases: ['zontix'], country: 'ru', role: 'Rifler' },
      { nick: 'chopper', country: 'ru', role: 'IGL' },
      { nick: 'magixx', country: 'ru', role: 'Support' },
    ],
  },
  {
    id: 'navi-2024', team: 'Natus Vincere', year: 2024,
    context: 'A NAVI pós-s1mple que ninguém esperava — campeã do Major de Copenhague 2024.',
    players: [
      { nick: 'Aleksib', aliases: ['aleksib'], country: 'fi', role: 'IGL' },
      { nick: 'iM', aliases: ['im'], country: 'ro', role: 'Rifler' },
      { nick: 'b1t', aliases: ['bit'], country: 'ua', role: 'Rifler' },
      { nick: 'jL', aliases: ['jl'], country: 'lt', role: 'Entry' },
      { nick: 'w0nderful', aliases: ['wonderful'], country: 'ua', role: 'AWP' },
    ],
  },
  {
    id: 'mouz-2024', team: 'MOUZ', year: 2024,
    context: 'A geração de prata da MOUZ que finalmente virou geração de ouro.',
    players: [
      { nick: 'torzsi', country: 'hu', role: 'AWP' },
      { nick: 'Jimpphat', aliases: ['jimpphat', 'jimpp'], country: 'fi', role: 'Rifler' },
      { nick: 'Brollan', aliases: ['brollan'], country: 'se', role: 'Entry' },
      { nick: 'xertioN', aliases: ['xertion'], country: 'il', role: 'Rifler' },
      { nick: 'siuhy', country: 'pl', role: 'IGL' },
    ],
  },
  {
    id: 'vitality-2025', team: 'Team Vitality', year: 2025,
    context: 'A era Vitality: o super-time do ZywOo que dominou 2025.',
    players: [
      { nick: 'ZywOo', aliases: ['zywoo'], country: 'fr', role: 'AWP' },
      { nick: 'apEX', aliases: ['apex'], country: 'fr', role: 'IGL' },
      { nick: 'ropz', country: 'ee', role: 'Lurker' },
      { nick: 'flameZ', aliases: ['flamez'], country: 'il', role: 'Entry' },
      { nick: 'mezii', country: 'gb', role: 'Rifler' },
    ],
  },
];
