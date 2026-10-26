// Pacotes de coins da loja do Ultimate: (1) batem com os tiers do servidor e
// (2) nenhum link estático do Woovi volta pra src/. O checkout fixo
// (woovi.com/pay/…) não carrega o correlationID "ultcoins:…", então o webhook
// ignora o Pix e o jogador paga sem receber os coins.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { COIN_PACKS } from '../src/components/ultimate/coinPacks.js';
import { COIN_TIERS } from './payments.js';

test('COIN_PACKS espelha COIN_TIERS (coins e preço)', () => {
  assert.deepEqual(COIN_PACKS.map((p) => p.tier).sort(), Object.keys(COIN_TIERS).sort());
  for (const p of COIN_PACKS) {
    const t = COIN_TIERS[p.tier];
    assert.equal(p.coins, t.coins, `coins do ${p.tier}`);
    assert.equal(p.price, `R$ ${t.cents / 100}`, `preço do ${p.tier}`);
  }
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const f = join(dir, n);
    return statSync(f).isDirectory() ? walk(f) : /\.(tsx?|css|html)$/.test(n) ? [f] : [];
  });
}

test('nenhum link estático woovi.com/pay/ em src/', () => {
  const hits = walk('src').filter((f) => readFileSync(f, 'utf8').includes('woovi.com/pay/'));
  assert.deepEqual(hits, [], 'use beginCoinsPix (cobrança com correlationID), nunca checkout fixo');
});
