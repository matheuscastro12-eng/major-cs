// CONTRATO DO REALISMO FM (fase 1) — fonte da verdade dos atributos de um jogador.
//
// Três frentes trabalham em paralelo em cima deste arquivo:
//   - dados: base da cena atual calibrada por estatísticas reais (bo3.gg) grava
//     `PlayerAttrs` por jogador;
//   - atributos: migração dos saves, CA/PA, evolução por atributo e a ponte
//     `legacyFromAttrs` para o código que ainda lê os 5 números antigos;
//   - motor: a partida por duelos lê SÓ `attrsOf(p)`.
// As ASSINATURAS abaixo são o contrato: a implementação interna pode mudar, os
// nomes e formatos não. Mudou o contrato? Combine antes com as outras frentes.
//
// Hoje (base): um jogador sem `attrs` próprios recebe atributos DERIVADOS dos 5
// números legados (o mesmo `playerAttributes` que a UI já mostra), então nada
// muda de comportamento até cada frente plugar a sua parte.

import { ALL_ATTRS, playerAttributes, computeOvrFromAttributes, type AttrKey, type PlayerForAttrs } from '../attributes';
import { hashStr } from '../../state/hash';
import type { Role } from '../../types';

export type { AttrKey };

// Atributos ocultos, como no FM: nunca aparecem como número na tela; o jogador
// só os percebe por relatórios de olheiro e pelo comportamento em jogo.
export type HiddenKey =
  | 'bigMatch'         // pressão: rende (ou some) em jogo grande, LAN, Major, playoff
  | 'temperament'      // resistência a tilt: quanto uma sequência ruim derruba o jogo
  | 'consistencyHidden'// variância real de jogo a jogo (o "Consistência" visível é a leitura do olheiro)
  | 'professionalism'  // treino, evolução, comportamento fora do servidor
  | 'ambition'         // quer títulos e clube maior; pesa em contrato e transferência
  | 'loyalty'          // apego ao clube; pesa em renovação e propostas
  | 'injuryProneness'  // propensão a lesão (punho, tendão) e burnout
  | 'versatility';     // rendimento fora da função principal

export const HIDDEN_KEYS: HiddenKey[] = [
  'bigMatch', 'temperament', 'consistencyHidden', 'professionalism', 'ambition', 'loyalty', 'injuryProneness', 'versatility',
];

// Escala FM: atributos 1–20; habilidade atual (CA) e potencial (PA) 1–200, CA ≤ PA.
export interface PlayerAttrs {
  v: 1;
  a: Record<AttrKey, number>;
  h: Record<HiddenKey, number>;
  ca: number;
  pa: number;
}

// Qualquer jogador do jogo (Player da base, TPlayer do torneio, jogador da
// Carreira/RtP/Ultimate) serve, desde que tenha id, função e os 5 legados; se
// trouxer `attrs`, eles vencem.
export type AttrsSource = PlayerForAttrs & { role: Role; attrs?: PlayerAttrs | null };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const unit = (seed: string) => (hashStr(seed) % 10_000) / 10_000; // 0..1 determinístico

// CA a partir do OVR por função (OVR 40–95 → CA 1–200).
export function caFromAttrs(a: Record<AttrKey, number>, role: Role): number {
  const ovr = computeOvrFromAttributes(a, role);
  return clamp(Math.round(((ovr - 40) / 55) * 200), 1, 200);
}

// Derivação da base (fallback). A frente "atributos" substitui por uma
// derivação calibrada; a frente "dados" grava valores reais em `attrs`.
export function deriveAttrs(p: AttrsSource): PlayerAttrs {
  const a = playerAttributes(p);
  const h = {} as Record<HiddenKey, number>;
  for (const k of HIDDEN_KEYS) {
    const noise = Math.round(unit(`hidden:${p.id}:${k}`) * 8) - 4; // -4..+4
    const base = k === 'bigMatch' ? a.clutch : k === 'temperament' ? a.composure : k === 'consistencyHidden' ? a.consistency : 11;
    h[k] = clamp(base + noise, 1, 20);
  }
  const ca = caFromAttrs(a, p.role);
  const headroom = Math.round(unit(`pa:${p.id}`) * 30); // sem idade aqui: a frente "atributos" usa a idade
  return { v: 1, a, h, ca, pa: clamp(ca + headroom, ca, 200) };
}

// A ÚNICA porta de leitura dos atributos. O motor e as telas usam só esta.
export function attrsOf(p: AttrsSource): PlayerAttrs {
  if (p.attrs && p.attrs.v === 1) return p.attrs;
  return deriveAttrs(p);
}

// Ponte para o código legado que ainda lê aim/awp/igl/clutch/consistency (0–100).
// Enquanto existir código lendo os 5 números, eles passam a SAIR dos atributos.
export interface LegacyStats { aim: number; awp: number; igl: number; clutch: number; consistency: number }
const avg = (a: Record<AttrKey, number>, ks: AttrKey[]) => ks.reduce((s, k) => s + a[k], 0) / ks.length;
export function legacyFromAttrs(x: PlayerAttrs): LegacyStats {
  const a = x.a;
  const to100 = (v: number) => clamp(Math.round((v / 20) * 100), 1, 99);
  return {
    aim: to100(avg(a, ['aim', 'tap', 'spray', 'headshot', 'crosshair', 'aimMovement', 'reflexes'])),
    awp: to100(avg(a, ['awp', 'crosshair', 'preAim', 'positioning'])),
    igl: to100(avg(a, ['leadership', 'communication', 'gameSense', 'decisions', 'vision'])),
    clutch: to100(avg(a, ['clutch', 'composure', 'concentration'])),
    consistency: to100(avg(a, ['consistency', 'concentration', 'discipline'])),
  };
}

export { ALL_ATTRS };
