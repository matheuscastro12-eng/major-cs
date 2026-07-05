// Analyst Report — T3.13 do roadmap em
// .claude/plans/faca-um-planejamento-para-piped-quilt.md.
//
// Antes de cada série RELEVANTE (playoffs, Major, decisivos), o analista
// entrega um relatório textual sobre o adversário: pontos fortes/fracos,
// mapa preferido, mapa fraco, jogadores-chave, composição em risco, e
// recomendação de ban/pick. Tudo derivado de mapPrefs + role distribution
// + dados visíveis do TTeam.
//
// Função pura (sem React). Consumer (VetoScreen / pre-match card) consome
// o resultado e exibe.

import type { MapId, Role, TPlayer, TTeam } from '../types';
import { MAP_LABELS, MAP_POOL } from '../types';
import { hashStr } from '../state/hash';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos

export interface AnalystReport {
  /** Mapa que o adversário PREFERE (cuidado pra não dar pick). */
  strongMap: MapId;
  /** Mapa que o adversário evita / é fraco. */
  weakMap: MapId;
  /** Lista de mapas a banir prioritariamente (até 2). */
  recommendedBans: MapId[];
  /** Mapa pra escolher se for nossa vez de pick. */
  recommendedPick: MapId;
  /** Jogador mais perigoso (maior OVR). */
  starPlayer: { nick: string; ovr: number; role: Role };
  /** Jogador mais fraco (menor OVR — alvo do entry/refrag). */
  weakLink: { nick: string; ovr: number; role: Role };
  /** Composição em risco: roles ausentes (Entry, AWP, IGL...). */
  missingRoles: Role[];
  /** Narrativa textual de 2-3 frases conectando os pontos. */
  narrative: string;
  /** Threat-level geral do adversário (1-5). 1 = limalheza, 5 = elite. */
  threatLevel: 1 | 2 | 3 | 4 | 5;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cálculo

/**
 * Gera o relatório do analista sobre o `opp` (adversário). Recebe também
 * o `me` (nosso time) pra dar contexto comparativo (mapas onde temos vantagem).
 *
 * `noiseSeed` é opcional pra que o mesmo confronto sempre gere o mesmo
 * relatório (estabilidade na UI — não muda a cada re-render).
 */
export function generateAnalystReport(opp: TTeam, me?: TTeam): AnalystReport {
  // 1) Mapas fortes/fracos do adversário via mapPrefs
  const oppPrefs = MAP_POOL.map((m) => ({
    m,
    pref: opp.mapPrefs?.[m] ?? 0,
    myPref: me?.mapPrefs?.[m] ?? 0,
  }));
  const sortedByOppPref = [...oppPrefs].sort((a, b) => b.pref - a.pref);
  const strongMap = sortedByOppPref[0].m;
  const weakMap = sortedByOppPref[sortedByOppPref.length - 1].m;

  // Bans prioritários: mapas em que ELE é mais forte E nós somos mais fracos.
  // Score = oppPref - myPref. Maior delta = mais perigoso pra gente.
  const banScored = oppPrefs
    .map((x) => ({ m: x.m, score: x.pref - x.myPref }))
    .sort((a, b) => b.score - a.score);
  const recommendedBans = banScored.slice(0, 2).map((x) => x.m);

  // Pick recomendado: mapa em que NÓS somos mais fortes (delta inverso),
  // mas excluindo o que ELE já preferiria (não daria de bandeja).
  const pickScored = oppPrefs
    .map((x) => ({ m: x.m, score: x.myPref - x.pref }))
    .sort((a, b) => b.score - a.score);
  const recommendedPick = pickScored[0]?.m ?? strongMap;

  // 2) Jogador estrela e elo fraco
  const players: TPlayer[] = opp.players ?? [];
  const sortedByOvr = [...players].sort((a, b) => b.ovr - a.ovr);
  const star = sortedByOvr[0];
  const weak = sortedByOvr[sortedByOvr.length - 1];

  // 3) Composição: roles ausentes que comprometem
  const rolesPresent = new Set<Role>();
  for (const p of players) {
    rolesPresent.add(p.role);
    if (p.role2) rolesPresent.add(p.role2);
  }
  // Roles "obrigatórias" pro padrão CS: AWP + IGL + Entry + (Support OU Lurker)
  const requiredRoles: Role[] = ['AWP', 'IGL', 'Entry'];
  const missingRoles = requiredRoles.filter((r) => !rolesPresent.has(r));

  // 4) Threat level: avg OVR dos top 5
  const top5 = sortedByOvr.slice(0, 5);
  const avgOvr = top5.length > 0 ? top5.reduce((a, p) => a + p.ovr, 0) / top5.length : 70;
  const threatLevel: AnalystReport['threatLevel'] =
    avgOvr >= 90 ? 5
      : avgOvr >= 84 ? 4
      : avgOvr >= 78 ? 3
      : avgOvr >= 72 ? 2
      : 1;

  // 5) Narrativa
  const narrative = buildNarrative({
    opp,
    star,
    weak,
    strongMap,
    weakMap,
    missingRoles,
    threatLevel,
  });

  return {
    strongMap,
    weakMap,
    recommendedBans,
    recommendedPick,
    starPlayer: star
      ? { nick: star.nick, ovr: Math.round(star.ovr), role: star.role }
      : { nick: '???', ovr: 0, role: 'Rifler' as Role },
    weakLink: weak && weak.id !== star?.id
      ? { nick: weak.nick, ovr: Math.round(weak.ovr), role: weak.role }
      : { nick: '???', ovr: 0, role: 'Rifler' as Role },
    missingRoles,
    narrative,
    threatLevel,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Narrativa textual

// Escolhe uma variante de forma DETERMINÍSTICA (mesmo confronto → mesmo texto),
// evitando que a UI troque a leitura a cada re-render. O seed mistura tag +
// mapa forte pra que times diferentes soem diferentes.
function pick<T>(variants: T[], seed: string): T {
  return variants[hashStr(seed) % variants.length];
}

// Frase 1 — apresentação do adversário. 3 leituras por threat level, todas
// no jargão de scout: quem entra favorito, onde está o perigo, o que cobrar.
const THREAT_LINES: Record<1 | 2 | 3 | 4 | 5, (tag: string) => string[]> = {
  5: (t) => [
    `${t} é elite mundial: sistema redondo, utility no talo e clutch sob pressão. Pra ter chance, TODO round precisa sair no plano.`,
    `${t} é top de mundo — não regala nada. Vão te punir cada peek fora de trade e cada eco mal jogado. Disciplina total.`,
    `${t} joga o CS completo: default paciente, mid-round afiado e retake letal. Só ganha quem não erra o básico.`,
  ],
  4: (t) => [
    `${t} é um adversário forte, de execução firme. Falha pouco no default — vamos precisar ganhar os duelos de abertura pra virar o jogo.`,
    `${t} bate no nível de cima quando engrena. Se deixar eles confortáveis no eco e no force-buy, o snowball vem. Preciso agressividade no timing.`,
    `${t} tem gás e leitura — time sólido. Nada de round de graça: força trade, joga utility antes de entrar e respeita a AWP deles.`,
  ],
  3: (t) => [
    `${t} joga em alto nível, mas tem buraco. Erram no mid-round e vacilam em rounds longos — segura o default e explora a inconstância.`,
    `${t} é um time competente com pontos exploráveis: reagem tarde ao anti-eco e amarram quando a estratégia principal é lida. Paciência ganha.`,
    `${t} tem jogadores capazes, mas o coletivo oscila. Force rounds fora do script deles — improviso não é o forte da equipe.`,
  ],
  2: (t) => [
    `${t} é meio de tabela: se a gente executar o básico com disciplina, o confronto é nosso. Sem afobação nas entradas.`,
    `${t} fica atrás no papel. O risco é subestimar e regalar round bobo — joga o default, ganha as trocas e fecha limpo.`,
    `${t} não tem o repertório pra segurar pressão de série longa. Impõe o ritmo e eles caem no próprio erro.`,
  ],
  1: (t) => [
    `${t} está claramente abaixo. Favorito claro somos nós — é entrar focado, sem relaxar no anti-eco, e não transformar isso em susto.`,
    `${t} é o azarão do confronto. O único jeito de perder aqui é jogar desligado: mantém a intensidade do primeiro ao último round.`,
    `${t} não deveria ameaçar. Joga sério, fecha os rounds fáceis e evita o clássico tropeço contra time menor.`,
  ],
};

// Leitura tática do astro conforme a FUNÇÃO — como neutralizá-lo no jargão real.
function starRead(nick: string, ovr: number, role: Role): string {
  const n = `${nick} (${ovr} OVR)`;
  switch (role) {
    case 'AWP':
      return `A ameaça mora na AWP: ${n} tranca os ângulos de abertura e segura bomb sozinho. Sem flash e trade em cima dele, o round já começa perdido — force a AWP com utility antes de qualquer peek.`;
    case 'IGL':
      return `${n} é o cérebro (IGL): lê o eco, chama o mid-round e puxa as viradas. Quebrar o timing do call dele — com force-buy fora do script — desmonta o sistema todo.`;
    case 'Entry':
      return `${n} é o entry: vive de first pick pra abrir o site. Prefire nos comuns que ele estoura e o motor do ataque deles trava.`;
    case 'Lurker':
      return `${n} lurka nas costas — aparece no retake e no exit frag quando o round já parece ganho. Fecha o flanco e conta os utilitários antes de rotacionar.`;
    case 'Support':
      return `${n} é o support que abre espaço: flash e molotov no talo pros riflers entrarem. Cortar a utility dele deixa as execuções nuas.`;
    default:
      return `${n} é a referência de rifle — spray control e refrag em qualquer duelo. Não dá espaço grátis: joga trade e evita duelo seco.`;
  }
}

// Leitura de um buraco de composição em termos de exploração.
function missingRead(role: Role): string {
  switch (role) {
    case 'AWP':
      return `sem AWP dedicado, o CT deles vive de utility e trade e sofre em ângulos longos — abusa das entradas e das linhas de AWP que eles não têm como devolver`;
    case 'IGL':
      return `sem IGL claro, se perdem no mid-round e reagem tarde ao anti-eco — puxa rounds longos e obriga eles a improvisar`;
    case 'Entry':
      return `sem entry de ofício, a abertura de bomb é lenta e sem trade — segura os comuns e ganha no default que eles não têm fôlego pra quebrar`;
    default:
      return `falta ${role} na base — buraco de função que dá pra explorar round a round`;
  }
}

function buildNarrative(ctx: {
  opp: TTeam;
  star?: TPlayer;
  weak?: TPlayer;
  strongMap: MapId;
  weakMap: MapId;
  missingRoles: Role[];
  threatLevel: 1 | 2 | 3 | 4 | 5;
}): string {
  const { opp, star, weak, strongMap, weakMap, missingRoles, threatLevel } = ctx;
  const seed = `${opp.tag}:${strongMap}:${weakMap}`;
  const sentences: string[] = [];

  // Frase 1: introdução com threat level (variante determinística por confronto)
  sentences.push(pick(THREAT_LINES[threatLevel](opp.tag), `${seed}:threat`));

  // Frase 2: leitura tática do astro por função + elo fraco
  if (star) {
    sentences.push(starRead(star.nick, Math.round(star.ovr), star.role));
  }
  if (weak && star && weak.id !== star.id) {
    sentences.push(pick(
      [
        `Do outro lado, ${weak.nick} (${Math.round(weak.ovr)}) é o elo fraco: alvo natural de entry e refrag — abre round por ele.`,
        `${weak.nick} (${Math.round(weak.ovr)}) é o ponto de menor resistência: caça o duelo com ele no anti-eco e nas trocas.`,
        `Se precisar de abertura barata, é no ${weak.nick} (${Math.round(weak.ovr)}) — costuma cair primeiro nas entradas.`,
      ],
      `${seed}:weak`,
    ));
  }

  // Frase 3: mapas / veto
  sentences.push(pick(
    [
      `No veto, banir ${MAP_LABELS[strongMap]} é prioridade — é a casa deles. Sofrem em ${MAP_LABELS[weakMap]}, que fica de pick natural pra gente.`,
      `${MAP_LABELS[strongMap]} é o mapa mais forte deles: primeiro ban da lista. Se sobrar ${MAP_LABELS[weakMap]}, é onde eles patinam — força a pick lá.`,
      `Tira ${MAP_LABELS[strongMap]} do veto logo de cara (é o conforto deles) e puxa o jogo pra ${MAP_LABELS[weakMap]}, o buraco do repertório adversário.`,
    ],
    `${seed}:map`,
  ));

  // Frase 4 (opcional): composição — leitura tática de cada função ausente
  if (missingRoles.length > 0) {
    const reads = missingRoles.map(missingRead);
    sentences.push(`Composição vulnerável: ${reads.join('; ')}.`);
  }

  return sentences.join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Take de bancada (RTP iter43 — "DIA DE JOGO")
//
// Versão de TRANSMISSÃO do relatório: 1 frase de leitura tática pro segmento
// "mesa redonda" do pré-jogo, montada com o MESMO material do report (astro,
// mapa forte/fraco, threat). Determinística por seedKey — mesmo confronto,
// mesma fala do analista.

export function deskTacticalLine(r: AnalystReport, oppTag: string, seedKey: string): string {
  const star = r.starPlayer;
  const strong = MAP_LABELS[r.strongMap];
  const weak = MAP_LABELS[r.weakMap];
  const threat = THREAT_LABEL[r.threatLevel].toLowerCase();
  const pool = [
    `Taticamente, tudo passa por ${star.nick} (${star.ovr} OVR). Se o ${oppTag} instalar o jogo em ${strong}, complica — o caminho é arrastar a série pra ${weak}.`,
    `No papel o ${oppTag} é ${threat}, e ${strong} é a casa deles. Cortar o espaço do ${star.nick} vale mais que qualquer pick hoje.`,
    `Pra mim a série começa no veto: ${strong} não pode passar, e ${weak} é onde o ${oppTag} patina. Feito isso, sobra vigiar o ${star.nick}.`,
  ];
  return pick(pool, `desk:${seedKey}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// UI helpers

export const THREAT_LABEL: Record<AnalystReport['threatLevel'], string> = {
  5: 'Elite mundial',
  4: 'Forte',
  3: 'Médio',
  2: 'Abaixo',
  1: 'Fraco',
};

export const THREAT_COLOR: Record<AnalystReport['threatLevel'], string> = {
  5: '#e25a5a',
  4: '#e8a93b',
  3: '#d8a943',
  2: '#5ed88a',
  1: '#5ed88a',
};
