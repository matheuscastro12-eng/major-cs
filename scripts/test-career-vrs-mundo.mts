// VRS — MUNDO VIVO. Contrato do rolante das orgs rivais.
// O ranking do jogador sempre decaiu e dependeu de resultado recente; o dos
// rivais era congelado. Estes testes fixam que o mundo agora se MEXE — e que
// mexer não quebrou a justiça da tabela (elite continua elite, azarão não vira
// #1 por sorte, e o mesmo save mostra sempre o mesmo mundo).
// Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aiRollingVrs, aiSplitGain, applyCareerVrsDecay, CAREER_VRS_DECAY, AI_VRS_WINDOW,
} from '../src/engine/career/progress.ts';

// mesma expressão do vrsCore do CareerScreen (miolo ~480-540, elite dispara)
const core = (tw: number) => Math.max(0, tw - 61) * 25 + Math.pow(Math.max(0, tw - 82), 2) * 10;
const ELITE = core(90);   // ~1365
const MIOLO = core(80);   // ~475
const FRACO = core(70);   // ~225

test('determinismo: mesmo (org, split) ⇒ mesmo VRS, sempre', () => {
  for (const s of [1, 2, 7, 23]) {
    assert.equal(aiRollingVrs('furia', ELITE, s), aiRollingVrs('furia', ELITE, s));
    assert.equal(aiSplitGain('furia', ELITE, s), aiSplitGain('furia', ELITE, s));
  }
  // orgs diferentes no mesmo split não podem cair no mesmo número
  const a = aiRollingVrs('furia', ELITE, 5);
  const b = aiRollingVrs('navi', ELITE, 5);
  assert.notEqual(a, b, 'o mundo não pode ser um empate geral');
});

test('o mundo SE MEXE: a mesma org muda de pontuação entre splits', () => {
  const serie = Array.from({ length: 12 }, (_, i) => aiRollingVrs('mibr', MIOLO, i + 1));
  assert.ok(new Set(serie).size >= 8, `esperava variação real, veio ${new Set(serie).size} valores distintos`);
  // e a variação é relevante (não é ruído de 1 ponto)
  const spread = Math.max(...serie) - Math.min(...serie);
  assert.ok(spread >= 40, `amplitude pequena demais (${spread}) — a tabela pareceria parada`);
});

test('a elite TROCA de posição entre splits (ninguém fica #1 por inércia)', () => {
  const orgs = ['furia', 'navi', 'faze', 'vitality', 'g2'];
  const lider = (split: number) =>
    orgs.map((o) => ({ o, v: aiRollingVrs(o, ELITE, split) })).sort((a, b) => b.v - a.v)[0].o;
  const lideres = new Set(Array.from({ length: 14 }, (_, i) => lider(i + 1)));
  assert.ok(lideres.size >= 2, 'o topo tem que rodar entre splits');
});

test('força enviesa, mas não garante: elite rende mais que fraco NA MÉDIA', () => {
  const media = (c: number) => {
    let t = 0;
    for (let s = 1; s <= 40; s++) t += aiSplitGain('org-teste', c, s);
    return t / 40;
  };
  assert.ok(media(ELITE) > media(MIOLO), 'elite rende mais que o miolo');
  assert.ok(media(MIOLO) > media(FRACO), 'miolo rende mais que o fraco');
});

test('o azarão NÃO vira #1: o rolante nunca cobre o buraco elite↔fraco', () => {
  // pior split possível da elite vs melhor rolante imaginável de um time fraco
  for (let s = 1; s <= 30; s++) {
    const elite = ELITE + aiRollingVrs('elite', ELITE, s);
    const fraco = FRACO + aiRollingVrs('zebra', FRACO, s);
    assert.ok(elite > fraco, `split ${s}: time fraco passou a elite (${fraco} > ${elite})`);
  }
});

test('recência: o ganho ANTIGO pesa menos que o recente (mesma régua do jogador)', () => {
  // um rolante é a soma decaída da janela; o split mais recente domina
  const g = (s: number) => aiSplitGain('org-x', MIOLO, s);
  const esperado = Array.from({ length: AI_VRS_WINDOW }, (_, k) => Math.pow(CAREER_VRS_DECAY, k) * g(10 - k))
    .reduce((a, b) => a + b, 0);
  assert.equal(aiRollingVrs('org-x', MIOLO, 10), Math.round(esperado));
  // e a régua é a MESMA do jogador
  assert.equal(applyCareerVrsDecay(100, 0), Math.round(100 * CAREER_VRS_DECAY));
});

test('começo de carreira: split 1 não olha pro passado inexistente', () => {
  assert.equal(aiRollingVrs('org-y', MIOLO, 1), aiSplitGain('org-y', MIOLO, 1));
  // e split inválido/zero não quebra nem devolve negativo
  for (const s of [0, -3, 0.4]) assert.ok(aiRollingVrs('org-y', MIOLO, s) > 0);
});

test('nunca devolve lixo (NaN/negativo) — o ranking ordena por isto', () => {
  for (const c of [0, FRACO, MIOLO, ELITE, 99999]) {
    for (let s = 1; s <= 15; s++) {
      const v = aiRollingVrs('org-z', c, s);
      assert.ok(Number.isFinite(v) && v >= 0, `valor inválido: ${v}`);
    }
  }
});
