// [integração · fase 3] Carreira sem contratos: F5 entre escolher o desafio e
// confirmar o elenco no mercado da fundação. `npm run test:sim`.
//
// Antes: o desafio gravava elenco + técnico e o estágio 'market' só existia em
// memória; no F5 o save (5 jogadores + técnico, sem liga) caía direto na escolha
// do campeonato — e os contratos, assinados só na confirmação do mercado, nunca
// existiam (folha no salário de mercado, sem renovação).
// Agora: (1) a fundação marca `foundingOpen` e o F5 volta pro mercado; (2) rede
// de segurança na hidratação e no início de cada split dá o contrato PADRÃO da
// fundação a quem estiver no elenco sem contrato (idempotente).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import { playerWage } from '../src/engine/ratings.ts';
import { migrateClube } from '../src/engine/clube/clubeMigration.ts';
import type { ClubeState } from '../src/engine/clube/model.ts';
import {
  ensureSquadContracts, materializeContracts, contractPayroll, defaultTerms, CONTRACT_TERM_DEFAULT, WAGE_PENDING,
} from '../src/engine/clube/contratos.ts';
import { needsMarket } from '../src/engine/clube/fundacao.ts';

const LEGACY = CS2_REAL_2026.find((t) => t.tag === 'LGC')!;
const squad = LEGACY.players.slice(0, 5).map((p) => ({ playerId: p.id, fromId: LEGACY.id }));
const wages = LEGACY.players.slice(0, 5).map((p) => ({ id: p.id, marketWage: playerWage(p) }));
// o que o desafio gravava no save (startFromOrg): elenco + técnico, nenhum contrato
const afterScenario = (flag: boolean) => ({
  org: { name: 'Legacy', tag: 'LGC' }, squad, coachFromId: LEGACY.id, split: 1, league: null,
  clube: migrateClube({}).clube as ClubeState, ...(flag ? { foundingOpen: true } : {}),
});

test('F5 no meio da fundação volta pro mercado (onde os contratos são assinados)', () => {
  const s = afterScenario(true);
  assert.equal(Object.keys(s.clube.contracts).length, 0, 'escolheu o desafio: ainda sem contrato');
  assert.equal(needsMarket(s), true, 'recarregou: o estágio inicial é o mercado, não a escolha do campeonato');
  assert.equal(needsMarket({ ...s, foundingOpen: false }), false, 'confirmou o elenco: segue a carreira');
  assert.equal(needsMarket({ ...s, squad: squad.slice(0, 4), foundingOpen: false }), true, 'elenco incompleto continua no mercado');
});

test('rede de segurança: save que já pulou o mercado ganha o contrato padrão da fundação, com a folha de mercado', () => {
  // save de antes do fix: recarregou, pulou o mercado e está sem contratos
  const s = afterScenario(false);
  // hidratação: sem resolver jogadores, o salário fica pendente…
  const hydrated = ensureSquadContracts(s, squad.map((x) => x.playerId), s.split)!;
  assert.ok(hydrated);
  for (const x of squad) {
    assert.equal(hydrated.contracts[x.playerId].until, s.split + CONTRACT_TERM_DEFAULT - 1, 'mesma duração da fundação (3 splits)');
    assert.equal(hydrated.contracts[x.playerId].wage, WAGE_PENDING);
  }
  // …e o primeiro render grava o playerWage (igual à migração): folha = mercado
  const materialized = materializeContracts({ clube: hydrated }, wages)!;
  const payroll = contractPayroll({ clube: materialized }, wages);
  assert.equal(payroll, wages.reduce((a, w) => a + w.marketWage, 0));
  // idempotente: nada a fazer na segunda vez
  assert.equal(ensureSquadContracts({ clube: materialized }, squad.map((x) => x.playerId), 1), null);
  assert.equal(materializeContracts({ clube: materialized }, wages), null);
});

test('rede de segurança no início do split: salário de mercado direto, quem já tem contrato não muda, stand-in não assina', () => {
  const s = afterScenario(false);
  const signed = { ...s.clube, contracts: { [squad[0].playerId]: defaultTerms(123_000, 1, 2) } };
  const next = ensureSquadContracts({ clube: signed }, squad.map((x) => x.playerId), 4, {
    wageOf: (id) => wages.find((w) => w.id === id)?.marketWage,
    exclude: new Set([squad[4].playerId]),
  })!;
  assert.equal(next.contracts[squad[0].playerId].wage, 123_000, 'contrato existente fica como está');
  assert.equal(next.contracts[squad[1].playerId].wage, wages[1].marketWage);
  assert.deepEqual(next.contracts[squad[1].playerId], defaultTerms(wages[1].marketWage, 4), 'contrato padrão da fundação no split atual');
  assert.equal(next.contracts[squad[4].playerId], undefined, 'stand-in emprestado não é seu');
});
