// Lembrete .ics do PGL Major Singapore: datas vêm do JSON do evento (fonte
// única), eventos de dia inteiro com DTEND exclusivo, texto escapado, linhas
// dobradas em 75 octetos e CRLF — o que os apps de calendário exigem.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMajorIcs, icsEscape, icsFold, nextDay } from '../src/engine/majorCalendar.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const data = JSON.parse(readFileSync(ROOT + 'src/data/major-singapore-2026.json', 'utf8')) as { event: { name: string; start: string; playoffsStart: string; end: string } };
const NOW = Date.UTC(2026, 9, 30, 12, 0, 0);
const URL_ = 'https://roadtomajor.com.br/major-singapore?ref=major-ics-major&utm_source=share&utm_medium=major-ics-major';

test('datas saem do JSON do evento (fonte única) e o DTEND é exclusivo', () => {
  const ics = buildMajorIcs(data.event, { lang: 'pt', url: URL_, nowMs: NOW });
  const start = data.event.start.replace(/-/g, '');
  assert.match(ics, new RegExp(`DTSTART;VALUE=DATE:${start}\\r\\n`));
  assert.match(ics, new RegExp(`DTEND;VALUE=DATE:${nextDay(data.event.start).replace(/-/g, '')}\\r\\n`));
  assert.match(ics, new RegExp(`DTSTART;VALUE=DATE:${data.event.playoffsStart.replace(/-/g, '')}\\r\\n`));
  assert.match(ics, new RegExp(`DTEND;VALUE=DATE:${nextDay(data.event.end).replace(/-/g, '')}\\r\\n`));
});

test('estrutura válida: CRLF, 2 eventos, alarme na véspera, DTSTAMP em UTC', () => {
  const ics = buildMajorIcs(data.event, { lang: 'pt', url: URL_, nowMs: NOW });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 2);
  assert.equal((ics.match(/BEGIN:VALARM/g) ?? []).length, 1);
  assert.match(ics, /TRIGGER;RELATED=START:-PT12H/);
  assert.match(ics, /DTSTAMP:20261030T120000Z/);
  assert.ok(!/[^\r]\n/.test(ics), 'toda quebra é CRLF');
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, `linha > 75 octetos: ${line}`);
});

test('idiomas e link de volta', () => {
  assert.match(buildMajorIcs(data.event, { lang: 'pt', url: URL_, nowMs: NOW }), /começa o Stage 1/);
  assert.match(buildMajorIcs(data.event, { lang: 'en', url: URL_, nowMs: NOW }), /Stage 1 starts/);
  assert.match(buildMajorIcs(data.event, { lang: 'es', url: URL_, nowMs: NOW }), /empieza el Stage 1/);
  const unfolded = buildMajorIcs(data.event, { lang: 'pt', url: URL_, nowMs: NOW }).replace(/\r\n /g, '');
  assert.ok(unfolded.includes(`URL:${URL_}`));
});

test('escape e dobra seguem a RFC 5545', () => {
  assert.equal(icsEscape('a, b; c\\d\ne'), 'a\\, b\\; c\\\\d\\ne');
  const long = 'DESCRIPTION:' + 'é'.repeat(80);
  const folded = icsFold(long);
  for (const l of folded.split('\r\n')) assert.ok(new TextEncoder().encode(l).length <= 75);
  assert.equal(folded.replace(/\r\n /g, ''), long);
});

test('nextDay vira mês e ano; data inválida falha alto', () => {
  assert.equal(nextDay('2026-11-30'), '2026-12-01');
  assert.equal(nextDay('2026-12-31'), '2027-01-01');
  assert.throws(() => nextDay('24/11/2026'));
});
