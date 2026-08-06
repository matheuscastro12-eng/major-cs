// TOTW — Time da Semana (in-forms semanais), o irmão semanal das promos
// mensais (promos.ts). Toda semana, 7 jogadores do catálogo BASE ganham versão
// 'totw' (+2 OVR), sorteados com seed da semana → todo cliente vê as MESMAS
// cartas. A chave `${playerId}:totw` é estável: in-forms de semanas passadas
// continuam válidas no catálogo (dedup igual às promos).
//
// COMPAT com o snapshot do servidor (chaveado por MÊS): o catálogo de um mês
// carrega as specs de TODAS as semanas que COMEÇAM até o fim daquele mês
// (totwSpecsThroughMonth é função pura de monthIndex). O "destaque da semana"
// (os 7 correntes + countdown) é conceito de UI, resolvido no cliente por
// weekIndex(new Date()).
//
// NOTA: imports relativos COM extensão .js — padrão dos módulos do Ultimate
// que também rodam no servidor (ver promos.ts).
import { makeRng } from '../rng.js';
import type { SpecialSpec, UltCard } from './cards.js';
import { monthEndMs } from './promos.js';

export const TOTW_BOOST = 2;   // +OVR da versão in-form
export const TOTW_SIZE = 7;    // jogadores in-form por semana
const WEEK_MS = 7 * 86400000;

// âncora da semana 0: segunda-feira 03/08/2026, 00:00 local (estreia do TOTW).
// Antes disso não existe TOTW.
function anchorMs(): number {
  return new Date(2026, 7, 3).getTime();
}

// índice absoluto da semana (0 = semana de estreia; negativo = antes da época).
export function weekIndex(d: Date): number {
  return Math.floor((d.getTime() - anchorMs()) / WEEK_MS);
}

export function weekStartMs(wi: number): number {
  return anchorMs() + wi * WEEK_MS;
}

// fim da semana `wi` — alimenta o countdown da Loja.
export function weekEndMs(wi: number): number {
  return anchorMs() + (wi + 1) * WEEK_MS;
}

export interface WeeklyTotw {
  weekIndex: number;
  playerIds: string[];   // os 7 in-forms da semana
  specs: SpecialSpec[];  // prontos pro buildCatalog (rarity 'totw', +TOTW_BOOST)
  endsAt: number;        // ms — quando a semana vira
}

// o TOTW de UMA semana: top-42 do catálogo base por OVR (desempate por playerId
// — estável) e sorteio de 7 seeded pela semana. O recorte largo (6x o time) faz
// o in-form alcançar além do topo absoluto — estrela de tier 2 também brilha.
export function totwForWeek(baseCatalog: UltCard[], wi: number): WeeklyTotw {
  const pool = [...baseCatalog]
    .sort((a, b) => b.ovr - a.ovr || a.playerId.localeCompare(b.playerId))
    .slice(0, TOTW_SIZE * 6);
  const rng = makeRng((((wi + 7919) * 2246822519) >>> 0) || 1);
  const chosen: UltCard[] = [];
  while (chosen.length < TOTW_SIZE && pool.length) {
    chosen.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return {
    weekIndex: wi,
    playerIds: chosen.map((c) => c.playerId),
    specs: chosen.map((c) => ({ playerId: c.playerId, rarity: 'totw' as const, ovrBoost: TOTW_BOOST })),
    endsAt: weekEndMs(wi),
  };
}

// specs de TODAS as semanas que começam até o FIM do mês `mi`, dedup por
// jogador — função pura de monthIndex, pro catálogo (e o snapshot do servidor)
// continuarem chaveados por mês.
export function totwSpecsThroughMonth(baseCatalog: UltCard[], mi: number): SpecialSpec[] {
  const out: SpecialSpec[] = [];
  const seen = new Set<string>();
  const end = monthEndMs(mi);
  for (let wi = 0; weekStartMs(wi) < end; wi++) {
    for (const s of totwForWeek(baseCatalog, wi).specs) {
      if (seen.has(s.playerId)) continue;
      seen.add(s.playerId);
      out.push(s);
    }
  }
  return out;
}
