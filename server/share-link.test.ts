import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanRef, shareHashtags, shareUrl, stripUrl, truncateForX, xIntentUrl, xWeight, X_TEXT_LIMIT, X_URL_WEIGHT } from '../src/state/shareLink.js';

test('shareUrl monta ref + utm com o domínio padrão', () => {
  assert.equal(
    shareUrl('/diario', 'daily'),
    'https://roadtomajor.com.br/diario?ref=daily&utm_source=share&utm_medium=daily',
  );
});

test('shareUrl não duplica ? quando o path já tem query e preserva o hash', () => {
  const u = shareUrl('/?desafio=abc', 'rtp-series');
  assert.equal(u, 'https://roadtomajor.com.br/?desafio=abc&ref=rtp-series&utm_source=share&utm_medium=rtp-series');
  assert.equal(u.split('?').length, 2);
  assert.equal(
    shareUrl('/carreira#legado', 'legado', {}, 'http://localhost:5173/'),
    'http://localhost:5173/carreira?ref=legado&utm_source=share&utm_medium=legado#legado',
  );
});

test('shareUrl aceita extras e saneia o ref pra kebab-case', () => {
  const u = new URL(shareUrl('ultimate', 'Ult Card!', { utm_campaign: 'semana-12' }));
  assert.equal(u.pathname, '/ultimate');
  assert.equal(u.searchParams.get('ref'), 'ult-card');
  assert.equal(u.searchParams.get('utm_medium'), 'ult-card');
  assert.equal(u.searchParams.get('utm_campaign'), 'semana-12');
  assert.equal(cleanRef('  CAREER_card  '), 'career-card');
});

test('xIntentUrl encoda emojis e quebras de linha e manda o link em &url=', () => {
  const link = shareUrl('/diario', 'daily');
  const text = 'diário #42 do road to major\n🧩✅ 🔎❌\n3/4';
  const intent = xIntentUrl(text, link);
  assert.ok(intent.startsWith('https://x.com/intent/post?'));
  assert.ok(!intent.includes('\n'));
  assert.ok(!intent.includes(' '));
  assert.ok(intent.includes('%0A'));
  const q = new URL(intent).searchParams;
  assert.equal(q.get('text'), text);
  assert.equal(q.get('url'), link);
});

test('xIntentUrl sem url não manda o parâmetro url', () => {
  const q = new URL(xIntentUrl('só texto + sinal')).searchParams;
  assert.equal(q.get('text'), 'só texto + sinal');
  assert.equal(q.has('url'), false);
});

test('texto acima de 270 é truncado com reticências e a URL fica inteira', () => {
  const link = shareUrl('/ultimate', 'ult-card');
  const long = 'a'.repeat(400);
  const q = new URL(xIntentUrl(long, link)).searchParams;
  const text = q.get('text') ?? '';
  assert.ok(text.endsWith('…'));
  assert.equal(q.get('url'), link);
  // texto + espaço + link (contado como 23) cabe no limite
  assert.ok(xWeight(text) + 1 + X_URL_WEIGHT <= X_TEXT_LIMIT);
  // emoji pesa 2 no contador do X
  assert.equal(xWeight('🏆'), 2);
  assert.ok(xWeight(truncateForX('🟩'.repeat(200), 50)) <= 50);
});

test('texto curto passa intacto', () => {
  const t = 'meu ultimate squad hoje: 88 de OVR, 7 vitórias';
  assert.equal(truncateForX(t, X_TEXT_LIMIT), t);
});

test('hashtags: no máximo 2', () => {
  for (const kind of ['daily', 'marathon', 'ult-card', 'legado', undefined]) {
    const tags = shareHashtags(kind).split(/\s+/).filter((w) => w.startsWith('#'));
    assert.ok(tags.length <= 2, `${kind}: ${tags.length}`);
  }
});

test('stripUrl tira o link do texto de share nativo', () => {
  const link = shareUrl('/diario', 'daily');
  assert.equal(stripUrl(`DIÁRIO #3 · ROAD TO MAJOR\n🧩✅\n${link}`, link), 'DIÁRIO #3 · ROAD TO MAJOR\n🧩✅');
});
