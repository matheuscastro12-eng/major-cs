// Lembrete do PGL Major Singapore em .ics (RFC 5545): o jogador baixa e o
// calendário do celular/PC avisa no dia — o motivo pra voltar em 24/11.
//
// Fonte ÚNICA das datas: o `event` de src/data/major-singapore-2026.json
// (start, playoffsStart, end). Eventos de dia inteiro de propósito: o início
// ainda tem divergência de fonte (HLTV/jogo: 24/11; site do estádio: 25/11 —
// pode ser só fuso de Singapura) e um evento com hora cravaria um horário que
// ninguém confirmou. Puro: sem Date.now, sem DOM (testado em
// scripts/test-major-calendar.mts).
import type { Lang } from '../state/i18n';

export interface MajorCalendarEvent {
  name: string;          // "PGL Major Singapore 2026"
  start: string;         // AAAA-MM-DD (1º dia do Stage 1)
  playoffsStart: string; // AAAA-MM-DD
  end: string;           // AAAA-MM-DD (dia da final, inclusivo)
}

const TEXT: Record<Lang, { stage1: string; playoffs: string; desc1: string; descPo: string; alarm: string }> = {
  pt: {
    stage1: 'começa o Stage 1',
    playoffs: 'playoffs e final',
    desc1: "Faça o seu pick'em antes do primeiro jogo:",
    descPo: "Confira o seu pick'em e acompanhe a chave:",
    alarm: "Amanhã começa o Major. Seu pick'em está pronto?",
  },
  en: {
    stage1: 'Stage 1 starts',
    playoffs: 'playoffs and final',
    desc1: "Make your Pick'em before the first match:",
    descPo: "Check your Pick'em and follow the bracket:",
    alarm: "The Major starts tomorrow. Is your Pick'em ready?",
  },
  es: {
    stage1: 'empieza el Stage 1',
    playoffs: 'playoffs y final',
    desc1: "Haz tu Pick'em antes del primer partido:",
    descPo: "Revisa tu Pick'em y sigue el cuadro:",
    alarm: "Mañana empieza el Major. ¿Tu Pick'em está listo?",
  },
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** AAAA-MM-DD → AAAAMMDD (valor DATE do iCalendar) */
function icsDate(day: string): string {
  if (!ISO_DAY.test(day)) throw new Error(`data inválida: ${day}`);
  return day.replace(/-/g, '');
}

/** dia seguinte (DTEND de evento de dia inteiro é exclusivo) */
export function nextDay(day: string): string {
  if (!ISO_DAY.test(day)) throw new Error(`data inválida: ${day}`);
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return t.toISOString().slice(0, 10);
}

/** escapa TEXT do iCalendar: \ ; , e quebra de linha */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** dobra linhas em 75 octetos (UTF-8), continuação com espaço — RFC 5545 §3.1 */
export function icsFold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // a continuação começa com 1 espaço
    if (bytes + n > limit) {
      out.push(cur);
      cur = ch;
      bytes = n;
    } else {
      cur += ch;
      bytes += n;
    }
  }
  out.push(cur);
  return out.join('\r\n ');
}

/** DTSTAMP em UTC (AAAAMMDDTHHMMSSZ) a partir de um instante em ms */
function icsStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * .ics com 2 eventos de dia inteiro: o 1º dia do Stage 1 (com alarme na
 * véspera ao meio-dia) e os playoffs até a final. `url` = link de volta pro
 * Modo Major (com ?ref=), `nowMs` = DTSTAMP (passado de fora pra ser puro).
 */
export function buildMajorIcs(ev: MajorCalendarEvent, opts: { lang: Lang; url: string; nowMs: number }): string {
  const L = TEXT[opts.lang] ?? TEXT.pt;
  const stamp = icsStamp(opts.nowMs);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Road to Major//Modo Major//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:pgl-major-singapore-2026-stage1@roadtomajor.com.br`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${icsDate(ev.start)}`,
    `DTEND;VALUE=DATE:${icsDate(nextDay(ev.start))}`,
    `SUMMARY:${icsEscape(`${ev.name}: ${L.stage1}`)}`,
    `DESCRIPTION:${icsEscape(`${L.desc1} ${opts.url}`)}`,
    `URL:${opts.url}`,
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER;RELATED=START:-PT12H',
    `DESCRIPTION:${icsEscape(L.alarm)}`,
    'END:VALARM',
    'END:VEVENT',
    'BEGIN:VEVENT',
    `UID:pgl-major-singapore-2026-playoffs@roadtomajor.com.br`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${icsDate(ev.playoffsStart)}`,
    `DTEND;VALUE=DATE:${icsDate(nextDay(ev.end))}`,
    `SUMMARY:${icsEscape(`${ev.name}: ${L.playoffs}`)}`,
    `DESCRIPTION:${icsEscape(`${L.descPo} ${opts.url}`)}`,
    `URL:${opts.url}`,
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(icsFold).join('\r\n') + '\r\n';
}
