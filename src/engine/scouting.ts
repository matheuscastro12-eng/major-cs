// Scouting — T3.12 do roadmap em
// .claude/plans/faca-um-planejamento-para-piped-quilt.md.
//
// O manager pode contratar UM scout por vez (4 disponíveis no catálogo, cada
// um com região foco + accuracy). A cada virada de split, o scout entrega 1-2
// relatórios sobre prospects (jovens promissores) da região-foco.
//
// Relatórios mostram: nick, idade, OVR aparente (com ruído proporcional à
// accuracy), região, role principal, e uma indicação "promessa S/A/B".
//
// Engine puro (sem React). Consumer fornece o pool de prospects e o engine
// escolhe quem é reportado.

import type { Rng } from './rng';

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo de scouts

export interface ScoutDef {
  id: string;
  name: string;
  /** Tier do scout: 1 = elite, 3 = local. Tier menor = melhor accuracy, mais caro. */
  tier: 1 | 2 | 3;
  /** Região de foco do scout. 'global' = qualquer */
  region: 'br' | 'americas' | 'emea' | 'pacific' | 'global';
  /** Salário por SPLIT (não semanal, pra casar com a economia do CareerSave) */
  salaryPerSplit: number;
  /** Precisão do OVR reportado: 1.0 = exato; 0.85 = ±15% ruído */
  accuracy: number;
  /** Quantos relatórios entrega por split (entre 1 e este valor) */
  reportsPerSplit: number;
}

export const SCOUTS: ScoutDef[] = [
  {
    id: 'scout-br-zumbi',
    name: 'Marcelo "zumbi" Silva',
    tier: 3,
    region: 'br',
    salaryPerSplit: 12_000,
    accuracy: 0.78,
    reportsPerSplit: 1,
  },
  {
    id: 'scout-americas-prata',
    name: 'Andrés "prata" Ríos',
    tier: 2,
    region: 'americas',
    salaryPerSplit: 28_000,
    accuracy: 0.88,
    reportsPerSplit: 2,
  },
  {
    id: 'scout-emea-thor',
    name: 'Thorsten "thor" Müller',
    tier: 2,
    region: 'emea',
    salaryPerSplit: 32_000,
    accuracy: 0.90,
    reportsPerSplit: 2,
  },
  {
    id: 'scout-global-dakota',
    name: 'Dakota "dak" North',
    tier: 1,
    region: 'global',
    salaryPerSplit: 75_000,
    accuracy: 0.97,
    reportsPerSplit: 3,
  },
];

export function scoutById(id: string): ScoutDef | undefined {
  return SCOUTS.find((s) => s.id === id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Relatórios

export type Promise = 'S' | 'A' | 'B' | 'C';

export interface ScoutReport {
  id: string;                   // unique id do relatório
  scoutId: string;              // quem produziu
  splitGenerated: number;        // split em que foi gerado
  playerId: string;             // referência ao player real
  playerNick: string;
  playerCountry: string;
  playerAge: number;
  playerRole: string;            // role principal
  /** OVR REAL do prospect (cheat-proof — só o consumer da UI usa pra mostrar
   *  comparação). O modal mostra o "aparente". */
  realOvr: number;
  /** OVR aparente reportado pelo scout (com ruído proporcional à accuracy) */
  reportedOvr: number;
  promise: Promise;              // S/A/B/C — categorização do potencial
  note: string;                  // texto curto (1 linha)
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos pro consumer

export interface ProspectCandidate {
  id: string;
  nick: string;
  country: string;
  age: number;
  role: string;
  ovr: number;
  region: 'br' | 'americas' | 'emea' | 'pacific' | string;
}

export interface ScoutingState {
  split: number;
  hiredScoutId?: string | null;
  /** Relatórios já gerados (histórico). Engine usa pra não repetir o mesmo player */
  scoutReports?: ScoutReport[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Geração

/**
 * Gera relatórios novos pra este split. Não muta o state.
 * Devolve array de novos relatórios — consumer concatena ao histórico.
 *
 * Regras:
 *   - Sem scout contratado → []
 *   - Pool já reportados (mesmo player) → filtra fora
 *   - Filtra pool por região do scout (se !global)
 *   - Pesa por idade (mais jovens = mais provável) + OVR mediano (não bota
 *     scout pra reportar veterano de elite ou prospect ridículo)
 *   - Quantidade entre 1 e `reportsPerSplit` (sorteado)
 *   - Ruído no OVR aparente proporcional ao (1 - accuracy)
 */
export function generateScoutReports(
  state: ScoutingState,
  pool: ProspectCandidate[],
  rng: Rng,
): ScoutReport[] {
  if (!state.hiredScoutId) return [];
  const scout = scoutById(state.hiredScoutId);
  if (!scout) return [];

  const reportedIds = new Set((state.scoutReports ?? []).map((r) => r.playerId));
  const eligible = pool.filter((p) => {
    if (reportedIds.has(p.id)) return false;
    if (p.age > 24) return false; // só prospects
    if (p.ovr < 50 || p.ovr > 84) return false; // sem extremos
    if (scout.region !== 'global' && p.region !== scout.region) return false;
    return true;
  });
  if (eligible.length === 0) return [];

  // Quantidade variável (mín 1, máx reportsPerSplit)
  const count = 1 + Math.floor(rng() * scout.reportsPerSplit);
  const reports: ScoutReport[] = [];
  const taken = new Set<string>();

  // Pesos: mais jovem + OVR razoável = mais provável
  const weighted = eligible.map((p) => ({
    p,
    w: Math.max(1, (25 - p.age) * 4 + (p.ovr - 50)),
  }));

  for (let i = 0; i < count && i < eligible.length; i++) {
    const remaining = weighted.filter((x) => !taken.has(x.p.id));
    if (remaining.length === 0) break;
    const totalW = remaining.reduce((sum, x) => sum + x.w, 0);
    let pick = rng() * totalW;
    let chosen = remaining[0];
    for (const c of remaining) {
      pick -= c.w;
      if (pick <= 0) {
        chosen = c;
        break;
      }
    }
    taken.add(chosen.p.id);

    // Ruído no OVR aparente
    const noise = (rng() - 0.5) * 2 * (1 - scout.accuracy) * 20; // ±N pontos
    const reportedOvr = Math.max(40, Math.min(99, Math.round(chosen.p.ovr + noise)));

    const promise = promiseFromOvr(chosen.p.ovr, chosen.p.age);
    const note = buildNote(scout, chosen.p, promise);

    reports.push({
      id: `rep-${scout.id}-${state.split}-${chosen.p.id}-${Math.floor(rng() * 100000)}`,
      scoutId: scout.id,
      splitGenerated: state.split,
      playerId: chosen.p.id,
      playerNick: chosen.p.nick,
      playerCountry: chosen.p.country,
      playerAge: chosen.p.age,
      playerRole: chosen.p.role,
      realOvr: chosen.p.ovr,
      reportedOvr,
      promise,
      note,
    });
  }

  return reports;
}

function promiseFromOvr(ovr: number, age: number): Promise {
  // Promessa S = jovem com OVR alto pra idade. C = OVR baixo ou já meio velho.
  const ageBonus = age <= 19 ? 8 : age <= 21 ? 4 : 0;
  const score = ovr + ageBonus;
  if (score >= 88) return 'S';
  if (score >= 78) return 'A';
  if (score >= 68) return 'B';
  return 'C';
}

// Observação específica por ROLE do prospect — o que o scout destaca no vídeo
// dele. Deixa cada relatório com sabor de CS de verdade (AWP, entry, lurk, call)
// em vez de um parecer genérico. Determinístico via seed (id+nick).
function roleObservation(role: string, seed: number): string {
  const pools: Record<string, string[]> = {
    AWP: [
      'AWP agressiva — adora o pick de abertura no comum',
      'segura ângulo de AWP com paciência de veterano',
      'flick de AWP consistente, mas às vezes força o duelo perdido',
      'reposiciona a AWP rápido depois do primeiro tiro',
    ],
    IGL: [
      'chamada clara e pós-plant bem desenhado',
      'lê a economia adversária e pune force-buy',
      'cabeça tática forte, mas ainda frag pouco pra IGL',
      'monta o meio de mapa com utility no timing certo',
    ],
    Entry: [
      'entry fragger nato — abre bomb sem pedir licença',
      'prefire afiado nos comuns, garante a primeira luz',
      'aposta na velocidade, às vezes morre em trade ruim',
      'primeiro a entrar, dita o ritmo do take',
    ],
    Support: [
      'utility impecável — smoke e flash sempre no tempo',
      'joga pro time: troca frag por espaço sem reclamar',
      'suporte silencioso que segura o pós-plant no detalhe',
      'baita lançador de granada, fecha rotação com molotov',
    ],
    Lurker: [
      'lurk paciente, aparece nas costas na hora exata',
      'lê rotação como ninguém e isola o retake',
      'timing de flanco perigoso, mas some do mapa em round ruim',
      'segura informação e explode o mapa no clutch',
    ],
    Rifler: [
      'rifler versátil, spray controlado no meião',
      'consistente no AK — troca duelo parelho em qualquer ângulo',
      'aim puro, ainda cru na leitura de round',
      'refrag confiável, não desperdiça a segunda entrada',
    ],
  };
  const list = pools[role] ?? pools.Rifler;
  return list[seed % list.length];
}

function buildNote(scout: ScoutDef, p: ProspectCandidate, promise: Promise): string {
  const flavors: Record<Promise, string[]> = {
    S: [
      'pode virar pivô de elenco tier 1',
      'mecânica de outro patamar pra idade',
      'já bate com profissionais médios em scrim',
    ],
    A: [
      'sólido em duelos abertos, ainda precisa polir tática',
      'leitura de mapa acima da média da idade',
      'projeto interessante pra 2-3 splits',
    ],
    B: [
      'cumpre o papel; precisa de coach forte',
      'reserva decente de tier 2',
      'tem ceiling limitado mas é confiável',
    ],
    C: [
      'mediano; só vale pra emergência',
      'pode crescer com playtime — risco alto',
      'profissional ok pra tier 3',
    ],
  };
  const seed = Math.abs(p.id.charCodeAt(0) + p.nick.length);
  const promiseNote = flavors[promise][seed % flavors[promise].length];
  const roleNote = roleObservation(p.role, seed);
  // O tier do scout modula a confiança do parecer: elite crava, local hesita.
  const prefix = scout.tier === 1 ? 'Parecer confiável: ' : scout.tier === 3 ? 'Impressão inicial: ' : '';
  return `${prefix}${roleNote}; ${promiseNote}.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// UI helpers

export const PROMISE_COLOR: Record<Promise, string> = {
  S: '#e8a93b',
  A: '#5ed88a',
  B: '#a3d860',
  C: '#8a8a8a',
};

export const REGION_LABEL: Record<string, string> = {
  br: 'Brasil',
  americas: 'Américas',
  emea: 'EMEA',
  pacific: 'Pacific',
  global: 'Global',
};
