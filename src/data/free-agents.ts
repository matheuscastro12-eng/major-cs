// Agentes livres do MODO CARREIRA: amplia o mercado de contratações com
// dezenas de jogadores extras (sem time atual). Determinístico: ids estáveis.
// Distribuídos por região/role e por faixa de OVR (alguns talentos, muito
// jogador mediano barato e alguns veteranos baratos).
import type { Coach, Player, Role, TeamSeason } from '../types';

interface FASeed {
  nick: string;
  name: string;
  cc: string;
  role: Role;
  ovr: number;
}

// faixas: poucos 82-86 (joias), bastante 70-80, vários 63-69 (baratos)
const FA_SEEDS: FASeed[] = [
  // América do Sul
  { nick: 'zppy', name: 'Caio Ferreira', cc: 'br', role: 'AWP', ovr: 84 },
  { nick: 'kr1to', name: 'Lucas Andrade', cc: 'br', role: 'Entry', ovr: 80 },
  { nick: 'dukka', name: 'Eduardo Pires', cc: 'br', role: 'Rifler', ovr: 76 },
  { nick: 'noven', name: 'Matheus Rocha', cc: 'br', role: 'Support', ovr: 73 },
  { nick: 'caverna', name: 'Bruno Lima', cc: 'br', role: 'Lurker', ovr: 71 },
  { nick: 'tigrinho', name: 'Pedro Souza', cc: 'br', role: 'IGL', ovr: 75 },
  { nick: 'mvltt', name: 'Gabriel Nunes', cc: 'br', role: 'Rifler', ovr: 67 },
  { nick: 'zikao', name: 'Rafael Dias', cc: 'br', role: 'Entry', ovr: 64 },
  { nick: 'pampa', name: 'Tomás Ibáñez', cc: 'ar', role: 'AWP', ovr: 78 },
  { nick: 'lautita', name: 'Lautaro Gómez', cc: 'ar', role: 'Rifler', ovr: 72 },
  { nick: 'andino', name: 'Felipe Rojas', cc: 'cl', role: 'Support', ovr: 69 },
  { nick: 'inka', name: 'Diego Quispe', cc: 'pe', role: 'Lurker', ovr: 66 },

  // América do Norte
  { nick: 'swndle', name: 'Ryan Carter', cc: 'us', role: 'Entry', ovr: 81 },
  { nick: 'vextr', name: 'Tyler Brooks', cc: 'us', role: 'AWP', ovr: 79 },
  { nick: 'frostbyte', name: 'Jordan Lee', cc: 'us', role: 'Rifler', ovr: 74 },
  { nick: 'maple', name: 'Owen Tremblay', cc: 'ca', role: 'IGL', ovr: 76 },
  { nick: 'griff', name: 'Mason Reed', cc: 'us', role: 'Support', ovr: 70 },
  { nick: 'turbo', name: 'Aiden Walsh', cc: 'ca', role: 'Rifler', ovr: 65 },
  { nick: 'azteca', name: 'Carlos Mendoza', cc: 'mx', role: 'Entry', ovr: 68 },

  // Europa
  { nick: 'volk', name: 'Markus Hofer', cc: 'de', role: 'AWP', ovr: 85 },
  { nick: 'pyro', name: 'Théo Laurent', cc: 'fr', role: 'Entry', ovr: 82 },
  { nick: 'nordic', name: 'Emil Lund', cc: 'dk', role: 'IGL', ovr: 80 },
  { nick: 'stahl', name: 'Lukas Bauer', cc: 'de', role: 'Rifler', ovr: 77 },
  { nick: 'wisla', name: 'Kacper Nowak', cc: 'pl', role: 'Support', ovr: 75 },
  { nick: 'fjord', name: 'Sander Berg', cc: 'no', role: 'Lurker', ovr: 73 },
  { nick: 'tulipan', name: 'Daan Visser', cc: 'nl', role: 'Rifler', ovr: 71 },
  { nick: 'luso', name: 'Rui Ferreira', cc: 'pt', role: 'AWP', ovr: 70 },
  { nick: 'kebab', name: 'Mert Yılmaz', cc: 'tr', role: 'Entry', ovr: 74 },
  { nick: 'highlander', name: 'Callum Scott', cc: 'gb', role: 'Rifler', ovr: 67 },
  { nick: 'sauna', name: 'Aleksi Mäkinen', cc: 'fi', role: 'Support', ovr: 66 },
  { nick: 'baguette', name: 'Hugo Moreau', cc: 'fr', role: 'Rifler', ovr: 63 },

  // CIS
  { nick: 'medved', name: 'Nikita Volkov', cc: 'ru', role: 'AWP', ovr: 83 },
  { nick: 'kometa', name: 'Artem Sokolov', cc: 'ru', role: 'Rifler', ovr: 78 },
  { nick: 'kazan', name: 'Daniyar Asanov', cc: 'kz', role: 'Entry', ovr: 76 },
  { nick: 'kyiv', name: 'Andriy Tkachenko', cc: 'ua', role: 'IGL', ovr: 79 },
  { nick: 'zubr', name: 'Pavel Kozlov', cc: 'by', role: 'Support', ovr: 70 },
  { nick: 'taiga', name: 'Maksim Orlov', cc: 'ru', role: 'Lurker', ovr: 68 },

  // Oceania
  { nick: 'reefer', name: 'Jack Thompson', cc: 'au', role: 'AWP', ovr: 77 },
  { nick: 'bondi', name: 'Liam Wright', cc: 'au', role: 'Entry', ovr: 72 },
  { nick: 'kiwi', name: 'Noah Wilson', cc: 'nz', role: 'Rifler', ovr: 67 },
  { nick: 'outback', name: 'Ethan Clarke', cc: 'au', role: 'IGL', ovr: 70 },

  // Ásia
  { nick: 'longwei', name: 'Zhang Wei', cc: 'cn', role: 'Rifler', ovr: 75 },
  { nick: 'sakura', name: 'Haruto Sato', cc: 'jp', role: 'AWP', ovr: 71 },
  { nick: 'merlion', name: 'Wei Jie', cc: 'sg', role: 'Support', ovr: 64 },
];

function makePlayer(s: FASeed): Player {
  const ovr = s.ovr;
  return {
    id: `fa__${s.nick}`,
    nick: s.nick,
    name: s.name,
    country: s.cc,
    role: s.role,
    aim: ovr,
    consistency: ovr,
    clutch: Math.max(40, ovr - 2),
    awp: s.role === 'AWP' ? ovr : Math.max(40, ovr - 26),
    igl: s.role === 'IGL' ? ovr : Math.max(35, ovr - 30),
  };
}

const FA_COACH: Coach = { nick: '-', name: '-', country: '', rating: 50, style: 'tactical' };

// Time sintético "Free Agents" que segura todos os agentes livres do mercado.
export function freeAgentTeam(): TeamSeason {
  return {
    id: '__fa__',
    team: 'Agentes Livres',
    tag: 'FA',
    era: '2026',
    game: 'CS2',
    country: '',
    teamwork: 50,
    honors: '',
    colors: ['#2a2f3a', '#9aa4b2'],
    mapPrefs: {},
    coach: FA_COACH,
    players: FA_SEEDS.map(makePlayer),
  };
}
