// Testes do módulo live-ops (server/liveops.ts) — validadores estritos por kind,
// janela, activeLiveops (enabled+janela+cap+ordem) e CRUD round-trip. Mesmo
// padrão FakeDb de server/ultimate-economy.mock.ts: um fake do tag `sql` que
// emula os statements do módulo num banco em memória.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  activeLiveops,
  deleteLiveop,
  listLiveops,
  LIVEOPS_MAX_ACTIVE,
  upsertLiveop,
  validateLiveopsWindow,
  validateNoticePayload,
  validatePromoPayload,
  validateSbcPayload,
  type SqlTag,
} from './liveops.js';

type Row = Record<string, unknown>;

interface PendingQuery extends PromiseLike<Row[]> {
  text: string;
  params: unknown[];
}

// FakeDb dos statements de rtm_liveops (upsert / active / list / delete).
class FakeLiveopsDb {
  rows = new Map<string, Row>();
  seq = 0;
  sql: SqlTag;

  constructor() {
    const tag = (strings: TemplateStringsArray, ...params: unknown[]): PendingQuery => {
      const text = strings.join(' ').replace(/\s+/g, ' ').trim();
      const q: PendingQuery = {
        text,
        params,
        then: (onOk, onErr) => Promise.resolve().then(() => this.run(q)).then(onOk, onErr),
      };
      return q;
    };
    const transaction = async (queries: PromiseLike<Row[]>[]): Promise<Row[][]> => {
      const out: Row[][] = [];
      for (const q of queries) out.push(this.run(q as PendingQuery));
      return out;
    };
    this.sql = Object.assign(tag, { transaction }) as unknown as SqlTag;
  }

  run(q: PendingQuery): Row[] {
    const { text, params } = q;
    if (text.startsWith('CREATE TABLE') || text.startsWith('CREATE INDEX')) return [];

    if (text.startsWith('INSERT INTO rtm_liveops')) {
      const [id, kind, payloadJson, startsAt, endsAt, enabled, createdBy] = params as [string, string, string, string, string, boolean, string];
      const prior = this.rows.get(id);
      const row: Row = {
        id, kind,
        payload: JSON.parse(payloadJson),
        starts_at: startsAt, ends_at: endsAt, enabled,
        created_by: prior ? prior.created_by : createdBy, // upsert não troca o autor
        updated_at: new Date(1_700_000_000_000 + ++this.seq * 1000).toISOString(),
        seq: prior ? prior.seq : this.seq,
      };
      this.rows.set(id, row);
      return [row];
    }

    if (text.includes('WHERE enabled AND starts_at <=')) {
      const nowIso = String(params[0]);
      const limit = Number(params[2]);
      return [...this.rows.values()]
        .filter((r) => !!r.enabled && String(r.starts_at) <= nowIso && String(r.ends_at) > nowIso)
        .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)) || String(a.id).localeCompare(String(b.id)))
        .slice(0, limit);
    }

    if (text.includes('ORDER BY starts_at DESC')) {
      return [...this.rows.values()]
        .sort((a, b) => String(b.starts_at).localeCompare(String(a.starts_at)) || String(a.id).localeCompare(String(b.id)))
        .slice(0, 200);
    }

    if (text.startsWith('DELETE FROM rtm_liveops')) {
      const id = String(params[0]);
      const existed = this.rows.delete(id);
      return existed ? [{ id }] : [];
    }

    throw new Error(`query não emulada: ${text.slice(0, 60)}`);
  }
}

// payloads bons reutilizados nos testes
const goodPromo = {
  name: 'Craques BR', desc: 'Promo de julho', color: '#4ADE80',
  filterKey: 'br', ovrBoost: 2, packCost: 25_000,
};
const goodSbc = {
  name: 'Uma Só Camisa', desc: '3 cartas Prata+ da mesma org.',
  req: { count: 3, sameOrg: true, minTier: 2 },
  reward: { credits: 3000 },
};
const goodNotice = { title: 'Manutenção', body: 'Ranking pausado por 1h.' };

describe('validatePromoPayload', () => {
  it('aceita payload bom e normaliza (trim, cor minúscula)', () => {
    const r = validatePromoPayload({ ...goodPromo, name: '  Craques BR  ' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.payload.name, 'Craques BR');
      assert.equal(r.payload.color, '#4ade80');
      assert.equal(r.payload.filterKey, 'br');
    }
  });
  it('aceita os limites (boost 1 e 3, custo 5000 e 100000)', () => {
    assert.equal(validatePromoPayload({ ...goodPromo, ovrBoost: 1, packCost: 5000 }).ok, true);
    assert.equal(validatePromoPayload({ ...goodPromo, ovrBoost: 3, packCost: 100_000 }).ok, true);
  });
  it('rejeita filterKey fora da allowlist (nunca código arbitrário)', () => {
    const r = validatePromoPayload({ ...goodPromo, filterKey: 'window.hack' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.field, 'filterKey');
  });
  it('rejeita boost/custo fora dos limites e não-inteiros', () => {
    for (const bad of [{ ovrBoost: 0 }, { ovrBoost: 4 }, { ovrBoost: 1.5 }, { packCost: 4999 }, { packCost: 100_001 }]) {
      assert.equal(validatePromoPayload({ ...goodPromo, ...bad }).ok, false, JSON.stringify(bad));
    }
  });
  it('rejeita cor não-hex, nome longo demais e não-objeto', () => {
    assert.equal(validatePromoPayload({ ...goodPromo, color: 'verde' }).ok, false);
    assert.equal(validatePromoPayload({ ...goodPromo, name: 'x'.repeat(41) }).ok, false);
    assert.equal(validatePromoPayload(null).ok, false);
    assert.equal(validatePromoPayload([goodPromo]).ok, false);
  });
});

describe('validateSbcPayload', () => {
  it('aceita payload bom (forma de SbcDef)', () => {
    const r = validateSbcPayload(goodSbc);
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.payload.req, { count: 3, sameOrg: true, minTier: 2 });
  });
  it('aceita os limites (count 3/5, tier 1/7, ovr 60/95, credits 30000, card válido)', () => {
    assert.equal(validateSbcPayload({ ...goodSbc, req: { count: 5, minTier: 7 }, reward: { card: 'major' } }).ok, true);
    assert.equal(validateSbcPayload({ ...goodSbc, req: { count: 3, minOvrAvg: 60 }, reward: { credits: 30_000 } }).ok, true);
    assert.equal(validateSbcPayload({ ...goodSbc, req: { count: 4, minOvrAvg: 95, minTier: 1 } }).ok, true);
  });
  it('rejeita bounds fora (count, tier, ovr, credits)', () => {
    assert.equal(validateSbcPayload({ ...goodSbc, req: { count: 2, sameOrg: true } }).ok, false);
    assert.equal(validateSbcPayload({ ...goodSbc, req: { count: 6, sameOrg: true } }).ok, false);
    assert.equal(validateSbcPayload({ ...goodSbc, req: { count: 3, minTier: 8 } }).ok, false);
    assert.equal(validateSbcPayload({ ...goodSbc, req: { count: 3, minOvrAvg: 59 } }).ok, false);
    assert.equal(validateSbcPayload({ ...goodSbc, req: { count: 3, minOvrAvg: 96 } }).ok, false);
    assert.equal(validateSbcPayload({ ...goodSbc, reward: { credits: 30_001 } }).ok, false);
    assert.equal(validateSbcPayload({ ...goodSbc, reward: { credits: -1 } }).ok, false);
  });
  it('rejeita reward.card com raridade inválida', () => {
    const r = validateSbcPayload({ ...goodSbc, reward: { card: 'diamond' } });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.field, 'reward.card');
  });
  it('rejeita SBC sem restrição além do count (anti-faucet) e sem recompensa', () => {
    const semReq = validateSbcPayload({ ...goodSbc, req: { count: 3 } });
    assert.equal(semReq.ok, false);
    if (!semReq.ok) assert.equal(semReq.field, 'req');
    const semReward = validateSbcPayload({ ...goodSbc, reward: { credits: 0 } });
    assert.equal(semReward.ok, false);
    if (!semReward.ok) assert.equal(semReward.field, 'reward');
  });
});

describe('validateNoticePayload', () => {
  it('aceita aviso bom e trima', () => {
    const r = validateNoticePayload({ title: ' Manutenção ', body: goodNotice.body });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.payload.title, 'Manutenção');
  });
  it('rejeita título/corpo vazios ou longos demais', () => {
    assert.equal(validateNoticePayload({ title: '', body: 'x' }).ok, false);
    assert.equal(validateNoticePayload({ title: 'x'.repeat(61), body: 'x' }).ok, false);
    assert.equal(validateNoticePayload({ title: 'ok', body: 'x'.repeat(281) }).ok, false);
    assert.equal(validateNoticePayload({ title: 'ok' }).ok, false);
  });
});

describe('validateLiveopsWindow', () => {
  it('aceita janela válida e normaliza pra ISO', () => {
    const r = validateLiveopsWindow('2026-07-01T00:00:00Z', '2026-07-31T00:00:00Z');
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.payload.startsAt, '2026-07-01T00:00:00.000Z');
  });
  it('aceita exatamente 45 dias, rejeita 45 dias + 1ms', () => {
    assert.equal(validateLiveopsWindow('2026-07-01T00:00:00Z', '2026-08-15T00:00:00Z').ok, true);
    assert.equal(validateLiveopsWindow('2026-07-01T00:00:00Z', '2026-08-15T00:00:00.001Z').ok, false);
  });
  it('rejeita fim ≤ início e datas inválidas', () => {
    assert.equal(validateLiveopsWindow('2026-07-02T00:00:00Z', '2026-07-01T00:00:00Z').ok, false);
    assert.equal(validateLiveopsWindow('2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z').ok, false);
    assert.equal(validateLiveopsWindow('quando der', '2026-07-01T00:00:00Z').ok, false);
    assert.equal(validateLiveopsWindow('2026-07-01T00:00:00Z', 'nunca').ok, false);
  });
});

const NOW = new Date('2026-07-10T12:00:00Z');
const win = { startsAt: '2026-07-01T00:00:00Z', endsAt: '2026-07-31T00:00:00Z' };

describe('upsertLiveop + activeLiveops + delete (FakeDb)', () => {
  it('round-trip: upsert → active devolve o evento com payload sanitizado', async () => {
    const db = new FakeLiveopsDb();
    const up = await upsertLiveop(db.sql, { id: 'promo-julho', kind: 'promo', payload: goodPromo, ...win });
    assert.equal(up.ok, true);
    const active = await activeLiveops(db.sql, NOW);
    assert.equal(active.length, 1);
    assert.equal(active[0].id, 'promo-julho');
    assert.equal(active[0].kind, 'promo');
    assert.deepEqual(active[0].payload, { ...goodPromo, color: '#4ade80' });
  });
  it('upsert atualiza o mesmo id (sem duplicar) e valida antes do banco', async () => {
    const db = new FakeLiveopsDb();
    await upsertLiveop(db.sql, { id: 'aviso', kind: 'notice', payload: goodNotice, ...win });
    const up2 = await upsertLiveop(db.sql, { id: 'AVISO', kind: 'notice', payload: { title: 'Novo', body: 'Corpo novo.' }, ...win });
    assert.equal(up2.ok, true);
    assert.equal(db.rows.size, 1);
    // payload inválido NÃO grava nada
    const bad = await upsertLiveop(db.sql, { id: 'aviso', kind: 'notice', payload: { title: '', body: 'x' }, ...win });
    assert.equal(bad.ok, false);
    const list = await listLiveops(db.sql);
    assert.equal((list[0].payload as { title: string }).title, 'Novo');
  });
  it('rejeita id não-slug, kind desconhecido e janela inválida (com field)', async () => {
    const db = new FakeLiveopsDb();
    const badId = await upsertLiveop(db.sql, { id: 'Promo Julho!', kind: 'promo', payload: goodPromo, ...win });
    assert.equal(badId.ok, false);
    if (!badId.ok) assert.equal(badId.field, 'id');
    const badKind = await upsertLiveop(db.sql, { id: 'x-1', kind: 'hack', payload: goodPromo, ...win });
    assert.equal(badKind.ok, false);
    if (!badKind.ok) assert.equal(badKind.field, 'kind');
    const badWin = await upsertLiveop(db.sql, { id: 'x-1', kind: 'promo', payload: goodPromo, startsAt: win.endsAt, endsAt: win.startsAt });
    assert.equal(badWin.ok, false);
    if (!badWin.ok) assert.equal(badWin.field, 'endsAt');
    assert.equal(db.rows.size, 0);
  });
  it('activeLiveops filtra por enabled e janela (antes/durante/depois)', async () => {
    const db = new FakeLiveopsDb();
    await upsertLiveop(db.sql, { id: 'ativo', kind: 'notice', payload: goodNotice, ...win });
    await upsertLiveop(db.sql, { id: 'desligado', kind: 'notice', payload: goodNotice, ...win, enabled: false });
    await upsertLiveop(db.sql, { id: 'futuro', kind: 'notice', payload: goodNotice, startsAt: '2026-08-01T00:00:00Z', endsAt: '2026-08-10T00:00:00Z' });
    await upsertLiveop(db.sql, { id: 'passado', kind: 'notice', payload: goodNotice, startsAt: '2026-06-01T00:00:00Z', endsAt: '2026-06-10T00:00:00Z' });
    const active = await activeLiveops(db.sql, NOW);
    assert.deepEqual(active.map((r) => r.id), ['ativo']);
    // borda: evento que termina EXATAMENTE agora não está mais ativo
    await upsertLiveop(db.sql, { id: 'borda', kind: 'notice', payload: goodNotice, startsAt: '2026-07-01T00:00:00Z', endsAt: NOW.toISOString() });
    const active2 = await activeLiveops(db.sql, NOW);
    assert.deepEqual(active2.map((r) => r.id), ['ativo']);
  });
  it('activeLiveops ordena por início e respeita o cap de 20', async () => {
    const db = new FakeLiveopsDb();
    for (let i = 0; i < LIVEOPS_MAX_ACTIVE + 5; i++) {
      const day = String(1 + (i % 9)).padStart(2, '0');
      await upsertLiveop(db.sql, {
        id: `ev-${String(i).padStart(2, '0')}`, kind: 'notice', payload: goodNotice,
        startsAt: `2026-07-${day}T00:00:00Z`, endsAt: '2026-07-31T00:00:00Z',
      });
    }
    const active = await activeLiveops(db.sql, NOW);
    assert.equal(active.length, LIVEOPS_MAX_ACTIVE);
    const starts = active.map((r) => r.startsAt);
    assert.deepEqual(starts, [...starts].sort());
  });
  it('deleteLiveop remove e devolve se existia; recusa id não-slug', async () => {
    const db = new FakeLiveopsDb();
    await upsertLiveop(db.sql, { id: 'apagar', kind: 'notice', payload: goodNotice, ...win });
    assert.equal(await deleteLiveop(db.sql, 'apagar'), true);
    assert.equal(await deleteLiveop(db.sql, 'apagar'), false);
    assert.equal(await deleteLiveop(db.sql, 'DROP TABLE;'), false);
    assert.equal((await listLiveops(db.sql)).length, 0);
  });
});
