// MIGRAÇÃO DO SAVE DO RTP (state/rtpSaves.ts) — O0-31 / ENGI-07.
//
// Cobertura:
//   - save de versão FUTURA (_v > RTP_SAVE_VERSION) não tem o _v rebaixado e
//     abre somente leitura: saveRtp recusa a gravação (local e nuvem)
//   - lacuna no registro de migrações LANÇA (antes parava e carimbava a versão
//     final, pulando a migração em silêncio)
//   - a cadeia real 1..RTP_SAVE_VERSION não tem lacuna
//   - save atual volta com o mesmo _v (idempotente no carimbo)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateRtp, migrateRtpWith, isRtpFromFuture, saveRtp, type RtpMigration } from '../src/state/rtpSaves.ts';
import { RTP_SAVE_VERSION } from '../src/engine/rtp/createSave.ts';
import { createRtpSave } from '../src/engine/rtp/createSave.ts';
import type { RoadToProSave } from '../src/engine/rtp/types.ts';

// localStorage mínimo em memória (o node não tem).
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
  clear: () => store.clear(),
};

function fresh(): RoadToProSave {
  return createRtpSave({
    nick: 'mig', country: 'br', role: 'Rifler', personality: 'resilient', archetype: 'allrounder', age: 17,
    categoryPoints: { mechanical: 4, mental: 4, physical: 4 }, seed: 11,
  });
}

test('rtp: save de versão futura preserva o _v e abre somente leitura', () => {
  const future = { ...fresh(), _v: RTP_SAVE_VERSION + 1, novoCampo: { formato: 'v-futuro' } } as unknown as Record<string, unknown>;
  const opened = migrateRtp(future) as unknown as Record<string, unknown>;
  assert.equal(opened._v, RTP_SAVE_VERSION + 1, 'o _v futuro foi rebaixado');
  assert.deepEqual(opened.novoCampo, { formato: 'v-futuro' });
  assert.equal(isRtpFromFuture(opened), true);
  // gravação bloqueada: nem o principal nem o backup mudam.
  store.clear();
  store.set('rtm-rtp-v1', '{"antigo":true}');
  assert.equal(saveRtp(opened as unknown as RoadToProSave), false);
  assert.equal(store.get('rtm-rtp-v1'), '{"antigo":true}');
  assert.equal(store.has('rtm-rtp-v1.bak'), false);
});

test('rtp: save atual grava normalmente e não é tratado como futuro', () => {
  store.clear();
  const s = fresh();
  assert.equal(isRtpFromFuture(s), false);
  assert.equal(saveRtp(s), true);
  const back = JSON.parse(store.get('rtm-rtp-v1')!);
  assert.equal(back._v, RTP_SAVE_VERSION);
  assert.equal((migrateRtp(back) as unknown as { _v: number })._v, RTP_SAVE_VERSION);
});

test('rtp: lacuna no registro de migrações lança em vez de pular', () => {
  const reg: Record<number, RtpMigration> = {
    1: (s) => ({ ...s, a: 1 }),
    // 2 ausente
    3: (s) => ({ ...s, c: 1 }),
  };
  assert.throws(() => migrateRtpWith({ _v: 1 }, reg, 4), /v2→v3 ausente/);
  // cadeia completa funciona e carimba só no fim.
  const full: Record<number, RtpMigration> = { ...reg, 2: (s) => ({ ...s, b: 1 }) };
  assert.deepEqual(migrateRtpWith({ _v: 1 }, full, 4), { _v: 4, a: 1, b: 1, c: 1 });
  // sem _v = v1 legado.
  assert.equal(migrateRtpWith({}, full, 4)._v, 4);
});

test('rtp: a cadeia real v1→atual não tem lacuna', () => {
  // um save v1 mínimo atravessa o registro real inteiro sem lançar.
  const v1 = { ...fresh(), _v: 1 } as unknown as Record<string, unknown>;
  const out = migrateRtp(v1) as unknown as { _v: number };
  assert.equal(out._v, RTP_SAVE_VERSION);
});
