// Conversor: palpite do Modo Major (#113, engine/majorSingapore MajorPicks) →
// formato da API do Pick'em oficial (#114, engine/majorPickem StagePick).
//   Stage N:  s{N} (8 classificados) + x30/x03 (2 cada)
//          →  threeZero = x30 (2), zeroThree = x03 (2), advance = s{N} − x30 (6)
//   Playoffs: bracket [QF1..QF4, SF1, SF2, campeão]
//          →  semis = vencedores das quartas (4), final = vencedores das semis (2), champion
// TS puro (sem React): testado em scripts/test-pickem-convert.mts.
import type { MajorPicks } from './majorSingapore';
import type { PickemStageId, PlayoffPick, StagePick, SwissPick } from './majorPickem';

export type ConvertResult = { ok: true; pick: StagePick } | { ok: false; error: string };

export function toApiPick(p: MajorPicks, stage: PickemStageId): ConvertResult {
  if (stage === 'playoffs') {
    const b = p.bracket;
    if (b.length < 7 || b.some((x) => !x)) return { ok: false, error: 'Complete a chave dos playoffs (quartas, semis e campeão).' };
    const pick: PlayoffPick = { semis: b.slice(0, 4), final: [b[4], b[5]], champion: b[6] };
    return { ok: true, pick };
  }
  const i = Number(stage.slice(1)) - 1;
  const adv = p[stage as 's1' | 's2' | 's3'];
  const x30 = p.x30[i] ?? [], x03 = p.x03[i] ?? [];
  if (adv.length !== 8) return { ok: false, error: `Escolha os 8 classificados do Stage ${i + 1}.` };
  if (x30.length !== 2 || x03.length !== 2) return { ok: false, error: `Escolha 2 times 3-0 e 2 times 0-3 no Stage ${i + 1}.` };
  if (!x30.every((id) => adv.includes(id))) return { ok: false, error: '3-0 precisa estar entre os classificados.' };
  if (x03.some((id) => adv.includes(id))) return { ok: false, error: '0-3 não pode estar entre os classificados.' };
  const pick: SwissPick = { threeZero: [...x30], zeroThree: [...x03], advance: adv.filter((id) => !x30.includes(id)) };
  return { ok: true, pick };
}

/** volta do formato da API pro do Modo Major (só o Stage informado; o resto fica como está) */
export function fromApiPick(base: MajorPicks, stage: PickemStageId, pick: StagePick): MajorPicks {
  if (stage === 'playoffs') {
    const pp = pick as PlayoffPick;
    return { ...base, bracket: [...pp.semis, ...pp.final, pp.champion] };
  }
  const i = Number(stage.slice(1)) - 1;
  const sp = pick as SwissPick;
  const x30 = [...base.x30] as MajorPicks['x30'];
  const x03 = [...base.x03] as MajorPicks['x03'];
  x30[i] = [...sp.threeZero]; x03[i] = [...sp.zeroThree];
  return { ...base, [stage]: [...sp.threeZero, ...sp.advance], x30, x03 };
}
