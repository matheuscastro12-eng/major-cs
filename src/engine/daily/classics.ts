// DIÁRIO — PLACAR DO CLÁSSICO: uma final histórica de Major por dia; você
// crava quem levantou a taça E o placar de mapas, em até 2 tentativas.
// Dataset curado à mão (finais de Major com placar real). Puro, determinístico
// pela DATA — mesma final pra todo mundo no dia.

import { makeRng } from '../rng';
import { hashStr } from '../../state/hash';
import { dayNumberOf } from './lines';

export interface ClassicFinal {
  id: string;
  event: string;            // "ESL One Katowice 2014"
  year: number;
  teamA: string;            // campeão SEMPRE em teamA no dataset (a UI embaralha)
  teamB: string;
  score: [number, number];  // placar de mapas na perspectiva de teamA (vencedor)
  context: string;          // a manchete (PT-BR, tom de caster) — SEM entregar o placar
}

// Finais de Major (CS:GO/CS2) com placar de mapas real — campeão em teamA.
export const CLASSIC_FINALS: ClassicFinal[] = [
  { id: 'kat14', event: 'EMS One Katowice 2014', year: 2014, teamA: 'Virtus.pro', teamB: 'Ninjas in Pyjamas', score: [2, 0], context: 'O Golden Five polonês em casa contra os reis suecos do online.' },
  { id: 'col14', event: 'ESL One Cologne 2014', year: 2014, teamA: 'Ninjas in Pyjamas', teamB: 'Fnatic', score: [2, 1], context: 'A guerra civil sueca na Lanxess Arena — e a redenção da NiP em Majors.' },
  { id: 'dhw14', event: 'DreamHack Winter 2014', year: 2014, teamA: 'LDLC', teamB: 'Ninjas in Pyjamas', score: [2, 1], context: 'Os franceses contra a NiP na final gelada de Jönköping.' },
  { id: 'kat15', event: 'ESL One Katowice 2015', year: 2015, teamA: 'Fnatic', teamB: 'Ninjas in Pyjamas', score: [2, 1], context: 'Mais uma final sueca — e o início da era mais dominante do CS:GO.' },
  { id: 'col15', event: 'ESL One Cologne 2015', year: 2015, teamA: 'Fnatic', teamB: 'EnVyUs', score: [2, 0], context: 'O bi da Fnatic contra a elite francesa em Colônia.' },
  { id: 'cluj15', event: 'DreamHack Cluj-Napoca 2015', year: 2015, teamA: 'EnVyUs', teamB: 'Na’Vi', score: [2, 0], context: 'kennyS e a EnVyUs contra o primeiro Major da história da Na’Vi.' },
  { id: 'col16', event: 'ESL One Cologne 2016', year: 2016, teamA: 'SK Gaming', teamB: 'Team Liquid', score: [2, 0], context: 'O Brasil de FalleN contra a Liquid de s1mple — a revanche da semi de Columbus.' },
  { id: 'atl17', event: 'ELEAGUE Atlanta 2017', year: 2017, teamA: 'Astralis', teamB: 'Virtus.pro', score: [2, 1], context: 'O primeiro Major dos dinamarqueses contra o Golden Five veterano.' },
  { id: 'kra17', event: 'PGL Krakow 2017', year: 2017, teamA: 'Gambit', teamB: 'Immortals', score: [2, 1], context: 'A zebra da CIS contra os brasileiros da Immortals — Zeus na call.' },
  { id: 'bos18', event: 'ELEAGUE Boston 2018', year: 2018, teamA: 'Cloud9', teamB: 'FaZe Clan', score: [2, 1], context: 'A América inteira de pé no overtime mais barulhento da história dos Majors.' },
  { id: 'lon18', event: 'FACEIT London 2018', year: 2018, teamA: 'Astralis', teamB: 'Na’Vi', score: [2, 0], context: 'A era Astralis passando por cima do time de s1mple em Londres.' },
  { id: 'kat19', event: 'IEM Katowice 2019', year: 2019, teamA: 'Astralis', teamB: 'ENCE', score: [2, 0], context: 'A dinastia dinamarquesa contra a sensação finlandesa do #EZ4ENCE.' },
  { id: 'ber19', event: 'StarLadder Berlin 2019', year: 2019, teamA: 'Astralis', teamB: 'AVANGAR', score: [2, 0], context: 'O tetra de Major da Astralis diante da zebra do Cazaquistão.' },
  { id: 'sto21', event: 'PGL Stockholm 2021', year: 2021, teamA: 'Na’Vi', teamB: 'G2 Esports', score: [2, 0], context: 's1mple atrás do primeiro Major da carreira — NiKo do outro lado.' },
  { id: 'ant22', event: 'PGL Antwerp 2022', year: 2022, teamA: 'FaZe Clan', teamB: 'Na’Vi', score: [2, 0], context: 'A superequipe internacional contra os campeões de Estocolmo.' },
  { id: 'rio22', event: 'IEM Rio 2022', year: 2022, teamA: 'Outsiders', teamB: 'Heroic', score: [2, 0], context: 'O Major do Brasil — a torcida no Jeunesse e a final que ninguém previu.' },
  { id: 'par23', event: 'BLAST.tv Paris 2023', year: 2023, teamA: 'Vitality', teamB: 'GamerLegion', score: [2, 0], context: 'O último Major de CS:GO — ZywOo em casa contra a zebra alemã.' },
  { id: 'cop24', event: 'PGL Copenhagen 2024', year: 2024, teamA: 'Na’Vi', teamB: 'FaZe Clan', score: [2, 1], context: 'O primeiro Major do CS2 — e a revanche de Antuérpia.' },
  { id: 'sha24', event: 'Perfect World Shanghai 2024', year: 2024, teamA: 'Team Spirit', teamB: 'FaZe Clan', score: [2, 1], context: 'donk, o prodígio, contra a FaZe de karrigan em Xangai.' },
];

export const CLASSIC_TRIES = 2;

export interface ClassicRound {
  id: string;
  event: string;
  year: number;
  context: string;
  // exibição embaralhada por dia (o campeão não é sempre o primeiro botão)
  teams: [string, string];
  // as 4 opções do dia na ORDEM de exibição: `${teamIdx}-${score}` — teamIdx
  // aponta pra `teams`, score é '2-0' | '2-1'
  options: { key: string; label: string }[];
  answerKey: string;        // a opção certa
}

// a final do dia — ciclo sem repetição (mesmo padrão dos outros jogos do Diário).
export function classicOfDay(dateKey: string, pool: ClassicFinal[] = CLASSIC_FINALS): ClassicRound {
  const n = dayNumberOf(dateKey) - 1;
  const cycle = Math.floor(n / pool.length);
  const rng0 = makeRng((hashStr(`classic:${cycle}`) ^ 0xc1a) >>> 0);
  const order = pool.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng0() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const f = pool[order[n % pool.length]];

  // embaralha lado por dia (senão "primeiro botão" viraria meta)
  const rng = makeRng((hashStr(`classic-day:${dateKey}:${f.id}`) ^ 0x5c0) >>> 0);
  const flip = rng() < 0.5;
  const teams: [string, string] = flip ? [f.teamB, f.teamA] : [f.teamA, f.teamB];
  const champIdx = flip ? 1 : 0;
  // key no formato `${teamIdx}-${mapsA}-${mapsB}` — a resposta usa o MESMO formato
  const options = [0, 1].flatMap((ti) => ['2-0', '2-1'].map((sc) => ({
    key: `${ti}-${sc}`,
    label: `${teams[ti]} ${sc}`,
  })));
  return {
    id: f.id, event: f.event, year: f.year, context: f.context,
    teams, options,
    answerKey: `${champIdx}-${f.score[0]}-${f.score[1]}`,
  };
}

export interface ClassicProgress {
  picks: string[];          // keys já tentadas
  done: boolean;
  won: boolean;
}

export function freshClassic(): ClassicProgress {
  return { picks: [], done: false, won: false };
}

export function applyClassicPick(round: ClassicRound, p: ClassicProgress, optionKey: string): ClassicProgress {
  if (p.done || p.picks.includes(optionKey) || !round.options.some((o) => o.key === optionKey)) return p;
  const picks = [...p.picks, optionKey];
  const won = optionKey === round.answerKey;
  return { picks, won, done: won || picks.length >= CLASSIC_TRIES };
}

// dica após o 1º erro: o jogo revela se você errou o CAMPEÃO ou só o placar.
export function classicHint(round: ClassicRound, lastPick: string): 'wrong-team' | 'wrong-score' {
  const [ti] = lastPick.split('-');
  const [ansTi] = round.answerKey.split('-');
  return ti === ansTi ? 'wrong-score' : 'wrong-team';
}

export function shareTextOfClassic(dateKey: string, round: ClassicRound, p: ClassicProgress, streak: number): string {
  const day = dayNumberOf(dateKey);
  const grid = p.picks.map((k) => (k === round.answerKey ? '🟩' : '🟥')).join('');
  const head = p.won
    ? p.picks.length === 1
      ? `Cravei o placar de ${round.event} DE PRIMEIRA ${grid}`
      : `Cravei o placar de ${round.event} ${grid}`
    : `${round.event} me pegou ${grid}`;
  const tail = streak >= 2 ? ` · 🔥 ${streak} dias seguidos` : '';
  return `PLACAR DO CLÁSSICO #${day} · MAJOR//CS\n${head}${tail}\nroadtomajor.com.br/diario`;
}
