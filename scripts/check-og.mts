// Confere as meta tags de compartilhamento no HTML do BUILD (dist/index.html).
// Uso: npm run build && npm run check:og [caminho-do-html]
import { readFileSync, statSync } from 'node:fs';
const file = process.argv[2] ?? 'dist/index.html';
const html = readFileSync(file, 'utf8');
const meta = {};
for (const m of html.matchAll(/<meta\s+([^>]+?)\/?>/g)) {
  const k = /(?:property|name)="([^"]+)"/.exec(m[1])?.[1]; const v = /content="([^"]*)"/.exec(m[1])?.[1];
  if (k && v != null) (meta[k] ??= []).push(v);
}
const errs = []; const one = (k) => meta[k]?.[0];
const need = ['og:title', 'og:description', 'og:url', 'og:type', 'og:image', 'og:image:width', 'og:image:height', 'og:image:alt', 'og:locale', 'og:locale:alternate', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image'];
for (const k of need) if (!one(k)) errs.push(`falta ${k}`);
for (const k of need) if ((meta[k]?.length ?? 0) > 1 && k !== 'og:locale:alternate') errs.push(`${k} duplicada`);
for (const k of ['og:url', 'og:image', 'twitter:image']) if (one(k) && !/^https:\/\//.test(one(k))) errs.push(`${k} não é URL absoluta https: ${one(k)}`);
if (one('og:image:width') !== '1200' || one('og:image:height') !== '630') errs.push('og:image precisa ser 1200x630');
if (one('twitter:card') !== 'summary_large_image') errs.push('twitter:card != summary_large_image');
if (one('og:locale') !== 'en_US') errs.push('og:locale != en_US');
if (!meta['og:locale:alternate']?.includes('pt_BR')) errs.push('falta alternate pt_BR');
if (one('og:image') !== one('twitter:image')) errs.push('og:image e twitter:image diferem');
if ((one('og:title') ?? '').length > 70) errs.push('og:title > 70 chars');
if ((one('og:description') ?? '').length > 200) errs.push('og:description > 200 chars');
// a imagem tem que existir no build, ser PNG/JPG, < 300 KB e 1200x630 de verdade
const img = one('og:image');
if (img) {
  const rel = new URL(img).pathname; const path = file.replace(/index\.html$/, '') + rel.replace(/^\//, '');
  try {
    const buf = readFileSync(path); const kb = statSync(path).size / 1024;
    if (kb >= 300) errs.push(`imagem com ${kb.toFixed(0)} KB (>= 300)`);
    let w = 0, h = 0;
    if (buf[0] === 0x89 && buf[1] === 0x50) { w = buf.readUInt32BE(16); h = buf.readUInt32BE(20); }
    else if (buf[0] === 0xff && buf[1] === 0xd8) {
      for (let i = 2; i < buf.length;) { const mk = buf[i + 1]; const len = buf.readUInt16BE(i + 2); if (mk >= 0xc0 && mk <= 0xc3) { h = buf.readUInt16BE(i + 5); w = buf.readUInt16BE(i + 7); break; } i += 2 + len; }
    } else errs.push('imagem não é PNG nem JPG');
    if (w !== 1200 || h !== 630) errs.push(`imagem é ${w}x${h}, esperado 1200x630`);
    else console.log(`imagem ok: ${rel} ${w}x${h} ${kb.toFixed(0)} KB`);
  } catch { errs.push(`imagem não encontrada no build: ${path}`); }
}
if (errs.length) { console.error('✖ OG/Twitter:\n  ' + errs.join('\n  ')); process.exit(1); }
console.log(`✔ ${need.length} tags OG/Twitter ok em ${file}`);
