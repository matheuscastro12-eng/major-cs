// O1-41 / ENGE-17 — O ARCHITECTURE.md cita as versões de save; se o código subir
// a versão e o doc ficar para trás, agentes e humanos decidem com dado errado
// (o doc antigo dizia SAVE_VERSION=7 com o código em 26).
// Roda `tsx --test scripts/test-docs-versions.mts`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SAVE_VERSION } from '../src/state/saveMigrations.ts';
import { RTP_SAVE_VERSION } from '../src/engine/rtp/createSave.ts';
import { ULTIMATE_VERSION } from '../src/engine/ultimate/state.ts';

const doc = readFileSync(new URL('../ARCHITECTURE.md', import.meta.url), 'utf8');

function docVersion(name: string): number {
  const m = doc.match(new RegExp('`' + name + ' = (\\d+)`'));
  assert.ok(m, `ARCHITECTURE.md não cita \`${name} = N\``);
  return Number(m[1]);
}

test('ARCHITECTURE.md traz as versões de save atuais', () => {
  assert.equal(docVersion('SAVE_VERSION'), SAVE_VERSION, 'atualize SAVE_VERSION no ARCHITECTURE.md');
  assert.equal(docVersion('RTP_SAVE_VERSION'), RTP_SAVE_VERSION, 'atualize RTP_SAVE_VERSION no ARCHITECTURE.md');
  assert.equal(docVersion('ULTIMATE_VERSION'), ULTIMATE_VERSION, 'atualize ULTIMATE_VERSION no ARCHITECTURE.md');
});
