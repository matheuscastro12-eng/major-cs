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
  const sentences: string[] = [];

  // Frase 1: introdução com threat level
  const threatLine = {
    5: `${opp.tag} é elite mundial — tudo precisa funcionar pra ter chance.`,
    4: `${opp.tag} é um adversário forte; vamos precisar de execução firme.`,
    3: `${opp.tag} joga em alto nível, mas tem pontos exploráveis.`,
    2: `${opp.tag} é um adversário de meio de tabela — temos vantagem se executarmos.`,
    1: `${opp.tag} está abaixo — favorito claro do confronto somos nós.`,
  }[threatLevel];
  sentences.push(threatLine);

  // Frase 2: star/weak players
  if (star && weak && star.id !== weak.id) {
    sentences.push(
      `Eles dependem muito do ${star.nick} (${Math.round(star.ovr)} OVR, ${star.role}). ` +
        `Já o ${weak.nick} (${Math.round(weak.ovr)}) é alvo natural de entry e refrag.`,
    );
  } else if (star) {
    sentences.push(
      `${star.nick} é o jogador a marcar — qualquer ronda passa pelas mãos dele.`,
    );
  }

  // Frase 3: mapas
  sentences.push(
    `O mapa preferido deles é ${MAP_LABELS[strongMap]} — recomendamos banir. ` +
      `Sofrem em ${MAP_LABELS[weakMap]}, que é nossa pick natural.`,
  );

  // Frase 4 (opcional): composição
  if (missingRoles.length > 0) {
    sentences.push(
      `O setup deles está sem ${missingRoles.join(', ')} — composição vulnerável que pode ser explorada.`,
    );
  }

  return sentences.join(' ');
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
