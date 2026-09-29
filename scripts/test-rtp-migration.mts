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
import { legacyFromAttrs, HIDDEN_KEYS } from '../src/engine/attrs/model.ts';
import { coreStatsFromAttrs, proToTPlayer, heroEngineAttrs, proAttrs, proOvr } from '../src/engine/rtp/coreStats.ts';
import { attrsOf, ovrFromAttrs, LEGACY_GROUPS } from '../src/engine/attrs/model.ts';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';

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

// ── v16 → v17 (realismo FM): ocultos do herói + attrs dos colegas ────────────

test('rtp v16 → v17: grava ocultos do herói e attrs dos colegas, idempotente', () => {
  const s = fresh() as unknown as Record<string, any>;
  const v16 = { ...s, _v: 16, player: { ...s.player }, team: { ...s.team, teammates: s.team.teammates.map((m: Record<string, unknown>) => { const c = { ...m }; delete c.attrs; return c; }) } };
  delete v16.player.hidden;
  const m = migrateRtp(v16) as unknown as Record<string, any>;
  assert.equal(m._v, RTP_SAVE_VERSION);
  for (const k of HIDDEN_KEYS) assert.ok(m.player.hidden[k] >= 1 && m.player.hidden[k] <= 20, k);
  assert.equal(m.team.teammates.length, 4);
  for (const t of m.team.teammates) {
    assert.equal(t.attrs.v, 1);
    const l = legacyFromAttrs(t.attrs);
    for (const k of ['aim', 'awp', 'igl', 'clutch', 'consistency']) assert.equal(l[k as 'aim'], t[k], `${t.nick}.${k}`);
  }
  // rodar de novo não muda nada (ocultos/attrs gravados são estáveis)
  const again = migrateRtp({ ...m, _v: 16 } as Record<string, unknown>) as unknown as Record<string, any>;
  assert.deepEqual(again.player.hidden, m.player.hidden);
  assert.deepEqual(again.team.teammates, m.team.teammates);
});

test('rtp: save novo já nasce com ocultos; os 5 números do herói saem dos atributos pela ponte', () => {
  const s = fresh();
  assert.ok(s.player.hidden);
  const tp = proToTPlayer(s.player);
  assert.equal(tp.attrs, undefined, 'o TPlayer não leva os 28 crus (escala própria do RtP)');
  const core = coreStatsFromAttrs(s.player.attrs);
  assert.deepEqual({ aim: tp.aim, awp: tp.awp, igl: tp.igl, clutch: tp.clutch, consistency: tp.consistency }, core);
});

// Pedido da frente C: um herói de OVR X tem que ter atributos na MESMA FAIXA de
// um colega de OVR X (o motor por duelos compara atributos diretamente).
test('rtp: heroEngineAttrs põe o herói na escala do mundo (OVR X ≈ colega de OVR X)', () => {
  const mates = CS2_REAL_2026.flatMap((t) => t.players);
  // faixa de comparação: os grupos que formam o OVR de qualquer função (mira,
  // clutch e consistência — AWP/IGL são especialidade e variam por função)
  const CORE = Object.keys({ ...LEGACY_GROUPS.aim, ...LEGACY_GROUPS.clutch, ...LEGACY_GROUPS.consistency });
  const meanAttr = (a: Record<string, number>) => CORE.reduce((x, k) => x + a[k], 0) / CORE.length;
  const byOvr = new Map<number, number[]>();
  for (const m of mates) {
    const o = ovrFromAttrs(attrsOf(m));
    byOvr.set(o, [...(byOvr.get(o) ?? []), meanAttr(attrsOf(m).a)]);
  }
  const roles = ['AWP', 'IGL', 'Rifler', 'Entry', 'Support', 'Lurker'] as const;
  let checked = 0;
  for (let i = 0; i < 60; i++) {
    const base = createRtpSave({
      nick: `esc${i}`, country: 'br', role: roles[i % 6], personality: 'leader', archetype: 'allrounder', age: 17,
      categoryPoints: { mechanical: i % 5, mental: (i >> 1) % 5, physical: (i >> 2) % 3 }, seed: 500 + i,
    });
    for (const grow of [0, 3, 6]) {
      const attrs = Object.fromEntries(Object.entries(base.player.attrs).map(([k, v]) => [k, Math.min(20, v + grow)])) as typeof base.player.attrs;
      const hero = { ...base.player, attrs, ovr: proOvr(attrs, base.player.role) };
      const x = heroEngineAttrs(hero);
      const o = ovrFromAttrs(x);
      assert.ok(Math.abs(o - hero.ovr) <= 1, `OVR do motor ${o} × exibido ${hero.ovr}`);
      assert.ok(x.pa >= x.ca && x.pa <= 200);
      assert.deepEqual(x.h, proAttrs(hero).h, 'ocultos preservados');
      const same = byOvr.get(o);
      if (!same || same.length < 5) continue;
      const mateMean = same.reduce((a, b) => a + b, 0) / same.length;
      assert.ok(Math.abs(meanAttr(x.a) - mateMean) <= 1, `OVR ${o}: herói ${meanAttr(x.a).toFixed(2)} × colegas ${mateMean.toFixed(2)}`);
      checked++;
    }
  }
  assert.ok(checked >= 60, `comparações com colegas de mesmo OVR: ${checked}`);
  // o perfil treinado continua: o atributo mais alto do herói segue entre os mais altos
  const s = fresh();
  const top = Object.entries(s.player.attrs).sort((a, b) => b[1] - a[1])[0][0] as keyof typeof s.player.attrs;
  const x = heroEngineAttrs(s.player);
  const rank = Object.values(x.a).filter((v) => v > x.a[top]).length;
  assert.ok(rank <= 6, `atributo mais treinado (${top}) segue no topo (posição ${rank + 1})`);
});
