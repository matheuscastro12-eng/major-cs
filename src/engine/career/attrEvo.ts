// [realismo FM · frente B] Evolução POR ATRIBUTO do elenco da Carreira.
//
// O save guarda, por jogador do SEU elenco, a variação acumulada de cada um dos
// 28 atributos em relação à BASE (`attrEvo`). Guardar a variação — e não os
// atributos inteiros — faz a base continuar mandando: uma edição do admin ou a
// chegada da base real de atributos (frente de dados) aparece no jogador do
// elenco com a evolução dele por cima, como já acontecia com o `evo` escalar.
//
// Regra de validade: `attrEvo[id]` só vale enquanto `evo` tiver a chave `id`
// (a Carreira sempre grava os dois juntos). Assim, todo lugar que já apaga
// `evo[id]` ao vender/liberar um jogador invalida a evolução por atributo junto,
// sem precisar conhecer este campo.
import { ALL_ATTRS, type AttrKey } from '../attributes';
import {
  attrsOf, caFromOvr, legacyFromA, ovrFromLegacy, refitAttrs,
  type AttrsSource, type LegacyStats, type PlayerAttrs,
} from '../attrs/model';

export type AttrDelta = Partial<Record<AttrKey, number>>;
export type AttrEvoMap = Record<string, AttrDelta>;

/** Atributos base + variação acumulada (clampado 1–20; CA recalculado; PA ≥ CA). */
export function applyAttrDelta(base: PlayerAttrs, delta: AttrDelta | undefined): PlayerAttrs {
  if (!delta) return base;
  const a = { ...base.a };
  let changed = false;
  for (const k of ALL_ATTRS) {
    const d = delta[k];
    if (!d) continue;
    a[k] = Math.max(1, Math.min(20, a[k] + d));
    changed = true;
  }
  if (!changed) return base;
  const ca = caFromOvr(ovrFromLegacy(legacyFromA(a)));
  return { v: 1, a, h: base.h, ca, pa: Math.max(base.pa, ca) };
}

/** Variação (só as diferentes de zero) entre atributos evoluídos e a base. */
export function attrDelta(evolved: Record<AttrKey, number>, base: Record<AttrKey, number>): AttrDelta {
  const out: AttrDelta = {};
  for (const k of ALL_ATTRS) {
    const d = evolved[k] - base[k];
    if (d) out[k] = d;
  }
  return out;
}

/** A evolução por atributo de `id` está valendo? (ver regra de validade no topo) */
export function activeAttrDelta(
  attrEvo: AttrEvoMap | undefined,
  evo: Record<string, number> | undefined,
  id: string,
): AttrDelta | undefined {
  if (!attrEvo || !evo || !(id in evo)) return undefined;
  return attrEvo[id];
}

/** Saneia o campo vindo do save (lixo vira ausente; valores fora de ±19 são cortados). */
export function normalizeAttrEvo(raw: unknown): AttrEvoMap {
  const out: AttrEvoMap = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, d] of Object.entries(raw as Record<string, unknown>)) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) continue;
    const clean: AttrDelta = {};
    for (const k of ALL_ATTRS) {
      const v = (d as Record<string, unknown>)[k];
      if (typeof v === 'number' && Number.isFinite(v) && v !== 0) clean[k] = Math.max(-19, Math.min(19, Math.round(v)));
    }
    out[id] = clean;
  }
  return out;
}

const clamp100 = (v: number) => Math.max(40, Math.min(99, v));

/**
 * Converte a evolução escalar antiga (`evo` + viés do foco de treino) de um
 * jogador em variação por atributo: parte dos atributos da base e reajusta com
 * o menor movimento até os 5 números baterem com base + evo + viés — o mesmo
 * jogador que o findSigning antigo montava. Puro (usado pela migração do save).
 */
export function attrDeltaFromScalarEvo(
  base: AttrsSource,
  evo: number,
  bias?: Partial<Record<keyof LegacyStats, number>>,
): AttrDelta {
  const x = attrsOf(base);
  const target: LegacyStats = {
    aim: clamp100(base.aim + evo + (bias?.aim ?? 0)),
    awp: clamp100(base.awp + evo + (bias?.awp ?? 0)),
    igl: clamp100(base.igl + evo + (bias?.igl ?? 0)),
    clutch: clamp100(base.clutch + evo + (bias?.clutch ?? 0)),
    consistency: clamp100(base.consistency + evo + (bias?.consistency ?? 0)),
  };
  return attrDelta(refitAttrs(x, target).a, x.a);
}
