// Fotos do palpite do Modo Major em cada trava (ver engine/pickemScore.ts →
// takeSnapshots/scoredPicks). Guardadas neste navegador; o placar local pontua
// cada Stage pela foto da hora em que ele travou, não pelo palpite editado depois.
import data from '../data/major-singapore-2026.json';
import { PICKEM_LOCKS } from '../data/majorResults';
import { decodePicks, encodePicks, type MajorData, type MajorPicks } from '../engine/majorSingapore';
import { PICK_PARTS, takeSnapshots, type PickPart, type PickSnapshots } from '../engine/pickemScore';

const D = data as unknown as MajorData;
const KEY = 'rtm-major-sg-pick-snapshots-v1';

function load(): PickSnapshots {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
    const out: PickSnapshots = {};
    for (const k of PICK_PARTS) if (typeof raw[k] === 'string') out[k] = raw[k] as string;
    return out;
  } catch { return {}; }
}

/** tira as fotos que faltam (travas que já passaram) com o palpite ATUAL. Chamar ANTES de qualquer edição. */
export function ensurePickSnapshots(current: MajorPicks, nowMs = Date.now()): void {
  const before = load();
  const after = takeSnapshots(before, PICKEM_LOCKS, nowMs, encodePicks(D, current));
  if (after === before) return;
  try { localStorage.setItem(KEY, JSON.stringify(after)); } catch { /* sem storage: o placar cai no palpite atual */ }
}

/** fotos decodificadas (null se a lista de times mudou e o código não abre mais) */
export function readPickSnapshots(): Partial<Record<PickPart, MajorPicks | null>> {
  const s = load();
  const out: Partial<Record<PickPart, MajorPicks | null>> = {};
  for (const k of PICK_PARTS) if (s[k] !== undefined) out[k] = decodePicks(D, s[k]!);
  return out;
}
