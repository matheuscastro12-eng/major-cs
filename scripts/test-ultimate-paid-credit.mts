// [O0-02/O0-46/O0-37] Lado cliente da economia mínima:
//   - o espelho só manda SAÍDAS pra rota `tx` (serverBoundTx);
//   - crédito pago entra no save 1× por voucher (absorbPaidVouchers), sem
//     depender de a tela estar montada nem de a resposta chegar na 1ª vez;
//   - proceeds/devoluções do mercado são 1× POR CONTA: a marca vai no save
//     (sincronizado), então outro aparelho / storage limpo não re-credita.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// localStorage fake pros módulos de state rodarem no Node
const mem = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => { mem.set(k, String(v)); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};

const { serverBoundTx } = await import('../src/state/ultimateShadow.ts');
const { useUltimate } = await import('../src/state/ultimate.ts');
const { migrateUltimate, passSeasonId } = await import('../src/engine/ultimate/state.ts');
const { ensurePass } = await import('../src/engine/ultimate/seasonPass.ts');

test('serverBoundTx: grant/reward/admin ficam só locais', () => {
  assert.equal(serverBoundTx('grant', 30_000, []), null);
  assert.equal(serverBoundTx('reward', 5000, [{ op: 'add', cardId: 'c1', cardKey: 'k' }]), null);
  assert.equal(serverBoundTx('admin', -100, [{ op: 'remove', cardId: 'c1' }]), null);
});

test('serverBoundTx: pack/sbc/spend mandam só a perna de saída', () => {
  assert.deepEqual(
    serverBoundTx('pack', -7500, [{ op: 'add', cardId: 'n1', cardKey: 'k:1' }, { op: 'add', cardId: 'n2', cardKey: 'k:2' }]),
    { creditsDelta: -7500, cards: [] },
  );
  // SBC que paga coins: as cartas entregues saem, o prêmio fica só local
  assert.deepEqual(
    serverBoundTx('sbc', 4000, [{ op: 'remove', cardId: 'a' }, { op: 'remove', cardId: 'b' }, { op: 'add', cardId: 'r', cardKey: 'k:r' }]),
    { creditsDelta: 0, cards: [{ op: 'remove', cardId: 'a' }, { op: 'remove', cardId: 'b' }] },
  );
  assert.equal(serverBoundTx('spend', 100, []), null);
  assert.deepEqual(serverBoundTx('spend', -8000, []), { creditsDelta: -8000, cards: [] });
});

test('serverBoundTx: quicksell manda remove (valor é só informativo)', () => {
  assert.deepEqual(
    serverBoundTx('quicksell', 700, [{ op: 'remove', cardId: 'c1' }]),
    { creditsDelta: 700, cards: [{ op: 'remove', cardId: 'c1' }] },
  );
  assert.equal(serverBoundTx('quicksell', 700, []), null);
});

const voucher = (opId: string, credits: number, orderId = opId.slice(6)) => ({ opId, kind: 'coins' as const, credits, orderId });

test('absorbPaidVouchers: cada voucher de coins entra 1× (retry/resposta repetida não duplica)', () => {
  const store = useUltimate.getState();
  store.reset();
  const before = useUltimate.getState().state.profile.credits;
  const r1 = useUltimate.getState().absorbPaidVouchers([voucher('coins:ultcoins:p10:a:1', 30_000)], ['ultcoins:p10:a:1']);
  assert.equal(r1.credited, 30_000);
  assert.equal(useUltimate.getState().state.profile.credits, before + 30_000);
  // o servidor devolve a lista inteira de novo no próximo claim
  const r2 = useUltimate.getState().absorbPaidVouchers([voucher('coins:ultcoins:p10:b:2', 50_000), voucher('coins:ultcoins:p10:a:1', 30_000)]);
  assert.equal(r2.credited, 50_000);
  assert.equal(useUltimate.getState().state.profile.credits, before + 80_000);
  assert.ok(useUltimate.getState().state.profile.srvSeen?.includes('coins:ultcoins:p10:a:1'));
});

test('absorbPaidVouchers: resposta perdida → o próximo claim ainda credita', () => {
  useUltimate.getState().reset();
  const before = useUltimate.getState().state.profile.credits;
  // 1º claim: servidor creditou e marcou claimed, mas a resposta nunca chegou (nada absorvido)
  // 2º claim: nenhum pedido novo (orders vazio), mas o voucher volta na lista
  const r = useUltimate.getState().absorbPaidVouchers([voucher('coins:ultcoins:p30:c:3', 120_000)], []);
  assert.equal(r.credited, 120_000);
  assert.equal(useUltimate.getState().state.profile.credits, before + 120_000);
});

test('absorbPaidVouchers: passe só liga premium da temporada corrente (ou pedido recém-claimado)', () => {
  useUltimate.getState().reset();
  const season = passSeasonId(useUltimate.getState().state.profile);
  // voucher de temporada passada absorvido num aparelho novo: só anota
  const old = useUltimate.getState().absorbPaidVouchers([{ opId: `pass:${season - 1}`, kind: 'pass', credits: 0, season: season - 1, orderId: 'o-old' }]);
  assert.equal(old.passUnlocked, false);
  assert.equal(ensurePass(useUltimate.getState().state.profile.pass, season).premium, false);
  const cur = useUltimate.getState().absorbPaidVouchers([{ opId: `pass:${season}`, kind: 'pass', credits: 0, season, orderId: 'o-cur' }], ['o-cur']);
  assert.equal(cur.passUnlocked, true);
  assert.equal(ensurePass(useUltimate.getState().state.profile.pass, season).premium, true);
});

test('mercado: proceeds 1× por conta — outro aparelho (save sincronizado, storage limpo) não re-credita', () => {
  useUltimate.getState().reset();
  const before = useUltimate.getState().state.profile.credits;
  assert.equal(useUltimate.getState().marketCardSold(41, 9500), true);
  assert.equal(useUltimate.getState().marketCardSold(41, 9500), false, 'poll/F5 no mesmo aparelho');
  assert.equal(useUltimate.getState().state.profile.credits, before + 9500);
  // aparelho B: o save chega pela nuvem, o "já vi" legado do localStorage não existe
  const synced = JSON.stringify(useUltimate.getState().state);
  mem.clear();
  useUltimate.getState().setState(migrateUltimate(JSON.parse(synced)));
  assert.equal(useUltimate.getState().marketCardSold(41, 9500), false, 'outro aparelho');
  assert.equal(useUltimate.getState().state.profile.credits, before + 9500);
});

test('mercado: devolução 1× por conta — carta usada depois não volta em outro aparelho', () => {
  useUltimate.getState().reset();
  assert.equal(useUltimate.getState().marketCardReturned(77, 'cp-77', 'bo3_18452:major'), true);
  assert.ok(useUltimate.getState().state.inventory.some((o) => o.id === 'cp-77'));
  // jogador vendeu/usou a carta no aparelho A…
  const s = useUltimate.getState().state;
  useUltimate.getState().setState({ ...s, inventory: s.inventory.filter((o) => o.id !== 'cp-77') });
  // …e abre o aparelho B com o save sincronizado
  const synced = JSON.stringify(useUltimate.getState().state);
  mem.clear();
  useUltimate.getState().setState(migrateUltimate(JSON.parse(synced)));
  assert.equal(useUltimate.getState().marketCardReturned(77, 'cp-77', 'bo3_18452:major'), false);
  assert.equal(useUltimate.getState().state.inventory.some((o) => o.id === 'cp-77'), false);
});

test('mercado: "já vi" legado deste aparelho continua valendo (e semeia o save)', () => {
  useUltimate.getState().reset();
  mem.set('rtm-ult-mkt-seen-v1', JSON.stringify(['sold:900']));
  assert.equal(useUltimate.getState().marketCardSold(900, 5000), false);
  mem.delete('rtm-ult-mkt-seen-v1');
});
